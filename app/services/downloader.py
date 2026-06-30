"""音乐下载服务 - 下载到本地音乐库"""

import httpx
import subprocess
import tempfile
import shutil
from pathlib import Path
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
from uuid import uuid4

from app.models.song import Song
from app.config import settings


class DownloadService:
    """音乐下载服务"""

    def __init__(self):
        self.music_root = Path(settings.MUSIC_ROOT)
        self.music_root.mkdir(parents=True, exist_ok=True)
        host = settings.HOST if settings.HOST != '0.0.0.0' else '127.0.0.1'
        self.base_url = f"http://{host}:{settings.PORT}"

    def _resolve_url(self, url: str) -> str:
        """将相对 URL 转换为绝对 URL"""
        if url.startswith('/'):
            return f"{self.base_url}{url}"
        return url

    async def download(
        self,
        db: AsyncSession,
        url: str,
        title: str = "未知歌曲",
        artist: Optional[str] = None,
        album: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
        track_info: Optional[Dict[str, Any]] = None,
    ) -> Song:
        """
        下载音乐到本地音乐库
        """
        temp_file_path = f"pending_{uuid4().hex}"
        song = Song(
            source_url=url,
            title=title,
            artist=artist or '未知歌手',
            album=album or '未知专辑',
            track_number=track_info.get("track_number", 0) if track_info else 0,
            file_path=temp_file_path,
            status='downloading',
        )
        db.add(song)
        await db.flush()

        temp_path = None
        try:
            # 下载到临时文件
            temp_path = Path(tempfile.mktemp(suffix='.m4a'))
            download_url = self._resolve_url(url)
            request_headers = headers or {}

            async with httpx.AsyncClient() as client:
                async with client.stream("GET", download_url, headers=request_headers, timeout=300) as response:
                    response.raise_for_status()
                    with open(temp_path, "wb") as f:
                        async for chunk in response.aiter_bytes(chunk_size=8192):
                            f.write(chunk)

            # 保存到音乐库
            final_path = self._get_save_path(
                artist or '未知歌手',
                album or '未知专辑',
                title,
                '.mp3'
            )
            final_path.parent.mkdir(parents=True, exist_ok=True)

            # 转换为 MP3
            if self._convert_to_mp3(temp_path, final_path):
                temp_path.unlink(missing_ok=True)
                temp_path = None
            else:
                shutil.move(str(temp_path), str(final_path))
                temp_path = None

            # 更新记录
            song.file_path = str(final_path)
            song.file_format = final_path.suffix[1:]
            song.file_size = final_path.stat().st_size
            song.duration = track_info.get("duration", 0) if track_info else 0
            song.status = 'completed'
            song.completed_at = datetime.utcnow()

        except Exception as e:
            song.status = 'failed'
            song.error_message = str(e)
            print(f"Download error: {e}")

        finally:
            if temp_path and temp_path.exists():
                temp_path.unlink(missing_ok=True)

        await db.commit()
        return song

    def _get_save_path(self, artist: str, album: str, title: str, ext: str) -> Path:
        """生成保存路径：MUSIC_ROOT/artist/album/title.ext"""
        safe_artist = self._sanitize_filename(artist)
        safe_album = self._sanitize_filename(album)
        safe_title = self._sanitize_filename(title)
        return self.music_root / safe_artist / safe_album / f"{safe_title}{ext}"

    def _sanitize_filename(self, name: str) -> str:
        """清理文件名中的非法字符"""
        illegal_chars = '<>:"/\\|?*'
        for char in illegal_chars:
            name = name.replace(char, '_')
        return name.strip()[:100]

    def _convert_to_mp3(self, input_path: Path, output_path: Path) -> bool:
        """使用 ffmpeg 转换为 MP3"""
        try:
            cmd = [
                "ffmpeg",
                "-i", str(input_path),
                "-codec:a", "libmp3lame",
                "-qscale:a", "2",
                "-y",
                str(output_path),
            ]
            result = subprocess.run(
                cmd,
                capture_output=True,
                encoding='utf-8',
                errors='ignore',
                timeout=120
            )
            return result.returncode == 0 and output_path.exists()
        except FileNotFoundError:
            print("FFmpeg not found, keeping original format")
            return False
        except Exception as e:
            print(f"Convert error: {e}")
            return False


# 创建全局实例
download_service = DownloadService()
