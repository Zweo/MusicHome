from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import Response, FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from typing import Optional, List
from pathlib import Path

from app.db import get_db
from app.models.song import Song, Playlist
from app.schemas.music import (
    SongResponse,
    SongListResponse,
    SongUpdate,
    PlaylistCreate,
    PlaylistResponse,
    PlaylistListResponse,
    MessageResponse,
    ScanResponse,
)
from app.services.metadata import metadata_service
from app.services.downloader import download_service
from app.services.scraper import music_scraper
from app.config import settings

router = APIRouter()


class ScrapeSearchResponse(BaseModel):
    """刮削搜索响应"""
    candidates: List[dict]


class ScrapeApplyRequest(BaseModel):
    """刮削应用请求"""
    netease_id: int
    write_title: bool = True
    write_artist: bool = True
    write_album: bool = True
    write_cover: bool = True
    write_lyrics: bool = True


@router.get("/songs", response_model=SongListResponse)
async def get_songs(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    artist: Optional[str] = Query(None, description="按歌手筛选"),
    album: Optional[str] = Query(None, description="按专辑筛选"),
    liked: Optional[int] = Query(None, description="收藏状态: 0 或 1"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    path_prefix: Optional[str] = Query(None, description="文件路径前缀筛选"),
    source_url: Optional[bool] = Query(None, description="筛选下载歌曲: true=仅下载, false=仅本地"),
    db: AsyncSession = Depends(get_db),
):
    """获取本地歌曲列表"""
    query = select(Song)
    count_query = select(func.count(Song.id))

    # 路径前缀筛选（用于下载管理）
    if path_prefix:
        query = query.where(Song.file_path.contains(path_prefix))
        count_query = count_query.where(Song.file_path.contains(path_prefix))

    # source_url 筛选
    if source_url is not None:
        if source_url:
            query = query.where(Song.source_url != '')
            count_query = count_query.where(Song.source_url != '')
        else:
            query = query.where(Song.source_url == '')
            count_query = count_query.where(Song.source_url == '')

    # 筛选条件
    if artist:
        query = query.where(Song.artist == artist)
        count_query = count_query.where(Song.artist == artist)
    if album:
        query = query.where(Song.album == album)
        count_query = count_query.where(Song.album == album)
    if liked is not None:
        query = query.where(Song.liked == liked)
        count_query = count_query.where(Song.liked == liked)
    if search:
        search_filter = or_(
            Song.title.contains(search),
            Song.artist.contains(search),
            Song.album.contains(search),
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    # 获取总数
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    # 分页
    query = query.offset((page - 1) * size).limit(size)
    query = query.order_by(Song.created_at.desc())

    result = await db.execute(query)
    songs = result.scalars().all()

    return SongListResponse(total=total, songs=songs)


@router.get("/songs/{song_id}", response_model=SongResponse)
async def get_song(song_id: int, db: AsyncSession = Depends(get_db)):
    """获取歌曲详情"""
    result = await db.execute(select(Song).where(Song.id == song_id))
    song = result.scalar_one_or_none()
    if not song:
        raise HTTPException(status_code=404, detail="歌曲不存在")
    return song


@router.put("/songs/{song_id}", response_model=SongResponse)
async def update_song(
    song_id: int,
    update: SongUpdate,
    db: AsyncSession = Depends(get_db),
):
    """更新歌曲元数据"""
    result = await db.execute(select(Song).where(Song.id == song_id))
    song = result.scalar_one_or_none()
    if not song:
        raise HTTPException(status_code=404, detail="歌曲不存在")

    # 更新字段
    update_data = update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(song, key, value)

    await db.flush()
    await db.refresh(song)
    return song


@router.delete("/songs/{song_id}", response_model=MessageResponse)
async def delete_song(song_id: int, db: AsyncSession = Depends(get_db)):
    """删除歌曲（从数据库和本地文件删除）"""
    result = await db.execute(select(Song).where(Song.id == song_id))
    song = result.scalar_one_or_none()
    if not song:
        raise HTTPException(status_code=404, detail="歌曲不存在")

    # 删除本地文件
    deleted_files = []
    
    # 1. 删除音频文件
    if song.file_path:
        audio_path = Path(song.file_path)
        if not audio_path.is_absolute():
            audio_path = Path(settings.BASE_DIR) / audio_path
        if audio_path.exists():
            try:
                audio_path.unlink()
                deleted_files.append(str(audio_path))
            except Exception as e:
                print(f"删除音频文件失败: {e}")

    # 2. 删除封面文件
    if song.cover_path:
        cover_path = Path(song.cover_path)
        if not cover_path.is_absolute():
            cover_path = Path(settings.BASE_DIR) / cover_path
        if cover_path.exists():
            try:
                cover_path.unlink()
                deleted_files.append(str(cover_path))
            except Exception as e:
                print(f"删除封面文件失败: {e}")

    # 3. 删除歌词文件（与音频同名的 .lrc 文件）
    if song.file_path:
        audio_path = Path(song.file_path)
        if not audio_path.is_absolute():
            audio_path = Path(settings.BASE_DIR) / audio_path
        lrc_path = audio_path.with_suffix('.lrc')
        if lrc_path.exists():
            try:
                lrc_path.unlink()
                deleted_files.append(str(lrc_path))
            except Exception as e:
                print(f"删除歌词文件失败: {e}")

    # 从数据库删除
    await db.delete(song)
    
    return MessageResponse(message=f"已删除: {song.title}")


@router.get("/artists")
async def get_artists(db: AsyncSession = Depends(get_db)):
    """获取所有歌手列表（包含封面）"""
    # 获取每个歌手的第一首歌曲的封面
    result = await db.execute(
        select(Song.artist, Song.cover_path, Song.id)
        .where(Song.artist != '未知歌手')
        .order_by(Song.artist)
    )
    rows = result.all()
    
    # 去重，保留每个歌手的第一首歌的封面
    artists = {}
    for row in rows:
        artist_name = row[0]
        if artist_name not in artists:
            artists[artist_name] = {
                "name": artist_name,
                "cover_path": row[1] or "",
                "song_id": row[2],
            }
    
    return list(artists.values())


@router.get("/albums")
async def get_albums(
    artist: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """获取专辑列表（包含封面）"""
    query = select(Song.album, Song.artist, Song.cover_path, Song.id)
    if artist:
        query = query.where(Song.artist == artist)
    query = query.where(Song.album != '未知专辑').order_by(Song.album)
    result = await db.execute(query)
    rows = result.all()
    
    # 去重，保留每个专辑的第一首歌的封面
    albums = {}
    for row in rows:
        album_name = row[0]
        if album_name not in albums:
            albums[album_name] = {
                "name": album_name,
                "artist": row[1] or '未知歌手',
                "cover_path": row[2] or "",
                "song_id": row[3],
            }
    
    return list(albums.values())


@router.post("/scan", response_model=ScanResponse)
async def scan_music_directory(db: AsyncSession = Depends(get_db)):
    """扫描音乐目录"""
    from app.services.scanner import music_scanner
    
    stats = await music_scanner.scan(db)
    
    return ScanResponse(
        total_scanned=stats['total_scanned'],
        new_added=stats['new_added'],
        updated=stats['updated'],
        errors=stats['errors'],
        message=f"扫描完成: 新增 {stats['new_added']} 首，更新 {stats['updated']} 首",
    )


@router.get("/scan-progress")
async def get_scan_progress():
    """获取扫描进度"""
    from app.services.scanner import music_scanner
    return music_scanner.progress


# ==================== 播放列表 ====================

@router.get("/playlists", response_model=PlaylistListResponse)
async def get_playlists(db: AsyncSession = Depends(get_db)):
    """获取播放列表（歌曲按添加时间倒序）"""
    result = await db.execute(
        select(Playlist)
        .options(selectinload(Playlist.songs))
        .order_by(Playlist.created_at.desc())
    )
    playlists = result.scalars().all()
    
    # 每个歌单内的歌曲按ID倒序（最新添加的在前面）
    for playlist in playlists:
        playlist.songs.sort(key=lambda s: s.id, reverse=True)
    
    return PlaylistListResponse(total=len(playlists), playlists=playlists)


@router.post("/playlists", response_model=PlaylistResponse)
async def create_playlist(
    playlist: PlaylistCreate,
    db: AsyncSession = Depends(get_db),
):
    """创建播放列表"""
    new_playlist = Playlist(name=playlist.name, description=playlist.description)
    db.add(new_playlist)
    await db.flush()
    await db.refresh(new_playlist)
    return new_playlist


@router.get("/playlists/{playlist_id}", response_model=PlaylistResponse)
async def get_playlist(playlist_id: int, db: AsyncSession = Depends(get_db)):
    """获取播放列表详情（包含歌曲，按添加时间倒序）"""
    result = await db.execute(
        select(Playlist)
        .options(selectinload(Playlist.songs))
        .where(Playlist.id == playlist_id)
    )
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=404, detail="播放列表不存在")
    
    # 按歌曲ID倒序（ID越大表示添加越晚）
    playlist.songs.sort(key=lambda s: s.id, reverse=True)
    
    return playlist


@router.post("/playlists/{playlist_id}/songs/{song_id}", response_model=MessageResponse)
async def add_song_to_playlist(
    playlist_id: int,
    song_id: int,
    db: AsyncSession = Depends(get_db),
):
    """添加歌曲到播放列表"""
    # 检查播放列表是否存在
    result = await db.execute(
        select(Playlist)
        .options(selectinload(Playlist.songs))
        .where(Playlist.id == playlist_id)
    )
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=404, detail="播放列表不存在")
    
    # 检查歌曲是否存在
    result = await db.execute(select(Song).where(Song.id == song_id))
    song = result.scalar_one_or_none()
    if not song:
        raise HTTPException(status_code=404, detail="歌曲不存在")
    
    # 检查歌曲是否已在播放列表中
    if song in playlist.songs:
        return MessageResponse(message="歌曲已在播放列表中")
    
    # 添加歌曲到播放列表
    playlist.songs.append(song)
    await db.flush()
    
    return MessageResponse(message=f"已添加到 {playlist.name}")


@router.delete("/playlists/{playlist_id}/songs/{song_id}", response_model=MessageResponse)
async def remove_song_from_playlist(
    playlist_id: int,
    song_id: int,
    db: AsyncSession = Depends(get_db),
):
    """从播放列表移除歌曲"""
    # 检查播放列表是否存在
    result = await db.execute(
        select(Playlist)
        .options(selectinload(Playlist.songs))
        .where(Playlist.id == playlist_id)
    )
    playlist = result.scalar_one_or_none()
    if not playlist:
        raise HTTPException(status_code=404, detail="播放列表不存在")
    
    # 检查歌曲是否存在
    result = await db.execute(select(Song).where(Song.id == song_id))
    song = result.scalar_one_or_none()
    if not song:
        raise HTTPException(status_code=404, detail="歌曲不存在")
    
    # 从播放列表移除歌曲
    if song in playlist.songs:
        playlist.songs.remove(song)
        await db.flush()
        return MessageResponse(message=f"已从 {playlist.name} 移除")
    
    return MessageResponse(message="歌曲不在播放列表中")


@router.put("/songs/{song_id}/like", response_model=MessageResponse)
async def toggle_like(song_id: int, db: AsyncSession = Depends(get_db)):
    """收藏/取消收藏"""
    result = await db.execute(select(Song).where(Song.id == song_id))
    song = result.scalar_one_or_none()
    if not song:
        raise HTTPException(status_code=404, detail="歌曲不存在")

    song.liked = 1 if song.liked == 0 else 0
    status = "收藏" if song.liked == 1 else "取消收藏"
    return MessageResponse(message=f"已{status}: {song.title}")


@router.get("/songs/{song_id}/cover")
async def get_song_cover(song_id: int, db: AsyncSession = Depends(get_db)):
    """获取歌曲封面"""
    result = await db.execute(select(Song).where(Song.id == song_id))
    song = result.scalar_one_or_none()
    if not song:
        raise HTTPException(status_code=404, detail="歌曲不存在")

    # 如果数据库中有封面路径，尝试查找文件
    if song.cover_path:
        cover_path = Path(song.cover_path)
        
        # 如果是绝对路径，直接检查
        if cover_path.is_absolute() and cover_path.exists():
            suffix = cover_path.suffix.lower()
            media_type_map = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
            }
            media_type = media_type_map.get(suffix, 'image/jpeg')
            return FileResponse(cover_path, media_type=media_type)
        
        # 如果是相对路径，尝试多个基础目录
        if not cover_path.is_absolute():
            candidates = [
                Path(settings.MUSIC_ROOT) / song.cover_path,
                Path(settings.BASE_DIR) / song.cover_path,
            ]
            for candidate in candidates:
                if candidate.exists():
                    suffix = candidate.suffix.lower()
                    media_type_map = {
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg',
                        '.png': 'image/png',
                    }
                    media_type = media_type_map.get(suffix, 'image/jpeg')
                    return FileResponse(candidate, media_type=media_type)

    # 尝试从音频文件同目录查找封面
    if song.file_path:
        audio_path = Path(song.file_path)
        if not audio_path.is_absolute():
            audio_path = Path(settings.BASE_DIR) / audio_path
        
        if audio_path.exists():
            # 查找同名封面文件
            for ext in ['.jpg', '.jpeg', '.png']:
                cover_file = audio_path.parent / f"{audio_path.stem}{ext}"
                if cover_file.exists():
                    media_type_map = {
                        '.jpg': 'image/jpeg',
                        '.jpeg': 'image/jpeg',
                        '.png': 'image/png',
                    }
                    media_type = media_type_map.get(ext, 'image/jpeg')
                    return FileResponse(cover_file, media_type=media_type)
            
            # 查找 cover.jpg/folder.jpg
            for name in ['cover', 'Cover', 'folder', 'Folder']:
                for ext in ['.jpg', '.jpeg', '.png']:
                    cover_file = audio_path.parent / f"{name}{ext}"
                    if cover_file.exists():
                        media_type_map = {
                            '.jpg': 'image/jpeg',
                            '.jpeg': 'image/jpeg',
                            '.png': 'image/png',
                        }
                        media_type = media_type_map.get(ext, 'image/jpeg')
                        return FileResponse(cover_file, media_type=media_type)

    # 没有封面，返回默认封面
    default_cover = Path("static/img/default-cover.png")
    if default_cover.exists():
        return FileResponse(default_cover, media_type="image/png")
    raise HTTPException(status_code=404, detail="封面不存在")


@router.get("/songs/{song_id}/lyrics")
async def get_song_lyrics(song_id: int, db: AsyncSession = Depends(get_db)):
    """获取歌曲歌词（从 .lrc 文件读取）"""
    result = await db.execute(select(Song).where(Song.id == song_id))
    song = result.scalar_one_or_none()
    if not song:
        raise HTTPException(status_code=404, detail="歌曲不存在")

    # 支持相对路径和绝对路径
    file_path = Path(song.file_path)
    if not file_path.is_absolute():
        file_path = Path(settings.BASE_DIR) / file_path
    
    # 尝试查找同名 .lrc 文件
    lrc_path = file_path.with_suffix('.lrc')
    
    if lrc_path.exists():
        try:
            lyrics_content = lrc_path.read_text(encoding='utf-8')
            return {"lyrics": lyrics_content}
        except Exception:
            pass
    
    # 尝试其他编码
    if lrc_path.exists():
        try:
            lyrics_content = lrc_path.read_text(encoding='gbk')
            return {"lyrics": lyrics_content}
        except Exception:
            pass

    return {"lyrics": ""}


# ==================== 下载管理 API ====================

@router.get("/downloads")
async def get_downloads(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(None, description="筛选状态"),
    db: AsyncSession = Depends(get_db),
):
    """获取下载列表（显示所有下载记录）"""
    # 查询所有下载记录（通过 source_url 或 status 区分）
    query = select(Song).where(Song.source_url != '')
    count_query = select(func.count(Song.id)).where(Song.source_url != '')

    if status:
        query = query.where(Song.status == status)
        count_query = count_query.where(Song.status == status)

    total = (await db.execute(count_query)).scalar()

    query = query.offset((page - 1) * size).limit(size)
    query = query.order_by(Song.created_at.desc())

    result = await db.execute(query)
    songs = result.scalars().all()

    return {
        "total": total,
        "downloads": [
            {
                "id": s.id,
                "title": s.title,
                "artist": s.artist,
                "album": s.album,
                "file_path": s.file_path,
                "file_format": s.file_format,
                "file_size": s.file_size,
                "duration": s.duration,
                "cover_path": s.cover_path,
                "status": s.status,
                "error_message": s.error_message,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "completed_at": s.completed_at.isoformat() if s.completed_at else None,
            }
            for s in songs
        ]
    }


@router.delete("/downloads/{download_id}")
async def delete_download(download_id: int, db: AsyncSession = Depends(get_db)):
    """删除下载记录"""
    success = await download_service.delete_download(db, download_id)
    if not success:
        raise HTTPException(status_code=404, detail="下载记录不存在")
    return {"message": "删除成功"}


# ========== 刮削 API ==========

class ScrapeSearchRequest(BaseModel):
    """刮削搜索请求"""
    keyword: Optional[str] = None
    page: int = 1


@router.post("/songs/{song_id}/scrape/search", response_model=ScrapeSearchResponse)
async def scrape_search(song_id: int, request: ScrapeSearchRequest = None, db: AsyncSession = Depends(get_db)):
    """搜索刮削候选"""
    # 获取歌曲信息
    result = await db.execute(select(Song).where(Song.id == song_id))
    song = result.scalar_one_or_none()
    if not song:
        raise HTTPException(status_code=404, detail="歌曲不存在")
    
    # 使用自定义关键词或构建默认关键词
    if request and request.keyword:
        keyword = request.keyword
    else:
        keyword = f"{song.title} {song.artist}"
    
    # 获取页码
    page = request.page if request else 1
    
    # 搜索网易云音乐（带分页）
    candidates = await music_scraper.search_netease(keyword, limit=5, page=page)
    
    return ScrapeSearchResponse(candidates=candidates)


@router.post("/songs/{song_id}/scrape/apply")
async def scrape_apply(
    song_id: int,
    request: ScrapeApplyRequest,
    db: AsyncSession = Depends(get_db),
):
    """应用刮削结果"""
    # 获取歌曲信息
    result = await db.execute(select(Song).where(Song.id == song_id))
    song = result.scalar_one_or_none()
    if not song:
        raise HTTPException(status_code=404, detail="歌曲不存在")
    
    # 检查文件是否存在（支持相对路径和绝对路径）
    file_path = Path(song.file_path)
    if not file_path.is_absolute():
        file_path = Path(settings.BASE_DIR) / file_path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"音频文件不存在: {file_path}")
    
    # 执行刮削
    scrape_result = await music_scraper.scrape_for_existing_song(
        file_path=file_path,
        netease_id=request.netease_id,
        original_metadata={
            "title": song.title,
            "artist": song.artist,
            "album": song.album,
        },
        write_cover=request.write_cover,
        write_lyrics=request.write_lyrics,
        write_title=request.write_title,
        write_artist=request.write_artist,
        write_album=request.write_album,
    )
    
    if not scrape_result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=scrape_result.get("error", "刮削失败"),
        )
    
    # 根据选项更新数据库
    if request.write_title:
        song.title = scrape_result.get("title", song.title)
    if request.write_artist:
        song.artist = scrape_result.get("artist", song.artist)
    if request.write_album:
        song.album = scrape_result.get("album", song.album)
    
    # 更新封面路径（存储绝对路径）
    if request.write_cover and scrape_result.get("cover_path"):
        cover_path = Path(scrape_result["cover_path"])
        song.cover_path = str(cover_path)
    
    # 更新文件路径（如果文件被重命名）
    if scrape_result.get("file_path"):
        new_file_path = Path(scrape_result["file_path"])
        song.file_path = str(new_file_path)
    
    await db.flush()
    await db.refresh(song)
    
    return {
        "success": True,
        "title": song.title,
        "artist": song.artist,
        "album": song.album,
        "has_cover": scrape_result.get("has_cover", False),
        "has_lyrics": scrape_result.get("has_lyrics", False),
    }


@router.post("/scrape/lyrics-preview")
async def scrape_lyrics_preview(netease_id: int):
    """获取刮削候选的歌词预览"""
    lyrics = await music_scraper.get_netease_lyrics(netease_id)
    return {"lyrics": lyrics or ""}
