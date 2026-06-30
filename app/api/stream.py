from fastapi import APIRouter, HTTPException, Header
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pathlib import Path
from typing import Optional
import os

from app.db import get_db, async_session
from app.models.song import Song

router = APIRouter()

CHUNK_SIZE = 1024 * 1024  # 1MB


@router.get("/{song_id}")
async def stream_audio(
    song_id: int,
    range: Optional[str] = Header(None),
):
    """音频流服务 - 支持 Range 请求"""
    async with async_session() as db:
        result = await db.execute(select(Song).where(Song.id == song_id))
        song = result.scalar_one_or_none()

    if not song:
        raise HTTPException(status_code=404, detail="歌曲不存在")

    file_path = Path(song.file_path)
    if not file_path.exists():
        # 文件不存在，删除数据库记录
        async with async_session() as cleanup_db:
            cleanup_song = await cleanup_db.get(Song, song_id)
            if cleanup_song:
                await cleanup_db.delete(cleanup_song)
                await cleanup_db.commit()
        raise HTTPException(status_code=404, detail="音频文件不存在，已清理数据库记录")

    file_size = file_path.stat().st_size
    content_type = _get_content_type(song.file_format)

    # 增加播放次数
    async with async_session() as db:
        result = await db.execute(select(Song).where(Song.id == song_id))
        song = result.scalar_one_or_none()
        if song:
            song.play_count += 1
            await db.commit()

    # 处理 Range 请求
    if range:
        start, end = _parse_range(range, file_size)
        content_length = end - start + 1

        def iter_file():
            with open(file_path, "rb") as f:
                f.seek(start)
                remaining = content_length
                while remaining > 0:
                    chunk_size = min(CHUNK_SIZE, remaining)
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(content_length),
            "Content-Type": content_type,
        }

        return StreamingResponse(
            iter_file(),
            status_code=206,
            headers=headers,
            media_type=content_type,
        )

    # 完整文件响应
    def iter_file():
        with open(file_path, "rb") as f:
            while chunk := f.read(CHUNK_SIZE):
                yield chunk

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(file_size),
        "Content-Type": content_type,
    }

    return StreamingResponse(
        iter_file(),
        headers=headers,
        media_type=content_type,
    )


def _parse_range(range_header: str, file_size: int) -> tuple[int, int]:
    """解析 Range 头"""
    try:
        range_spec = range_header.replace("bytes=", "")
        start_str, end_str = range_spec.split("-")
        start = int(start_str) if start_str else 0
        end = int(end_str) if end_str else file_size - 1
        return start, min(end, file_size - 1)
    except (ValueError, IndexError):
        return 0, file_size - 1


def _get_content_type(file_format: Optional[str]) -> str:
    """根据文件格式返回 Content-Type"""
    format_map = {
        "mp3": "audio/mpeg",
        "flac": "audio/flac",
        "wav": "audio/wav",
        "ogg": "audio/ogg",
        "m4a": "audio/mp4",
        "aac": "audio/aac",
        "wma": "audio/x-ms-wma",
    }
    if file_format:
        return format_map.get(file_format.lower(), "audio/mpeg")
    return "audio/mpeg"
