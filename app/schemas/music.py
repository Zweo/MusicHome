from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List


# ==================== 歌曲 Schemas ====================

class SongBase(BaseModel):
    title: str
    artist: str = "未知歌手"
    album: str = "未知专辑"
    track_number: Optional[int] = 0
    duration: float = 0.0
    file_format: Optional[str] = None


class SongCreate(SongBase):
    file_path: str


class SongUpdate(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    track_number: Optional[int] = None
    liked: Optional[int] = None


class SongResponse(SongBase):
    id: int
    file_path: str
    file_size: int
    cover_path: str
    liked: int
    play_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SongListResponse(BaseModel):
    total: int
    songs: List[SongResponse]


# ==================== 播放列表 Schemas ====================

class PlaylistBase(BaseModel):
    name: str
    description: str = ""


class PlaylistCreate(PlaylistBase):
    pass


class PlaylistUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class PlaylistResponse(PlaylistBase):
    id: int
    cover_path: str
    created_at: datetime
    updated_at: datetime
    songs: List[SongResponse] = []

    class Config:
        from_attributes = True


class PlaylistListResponse(BaseModel):
    total: int
    playlists: List[PlaylistResponse]


# ==================== 下载 Schemas ====================

class DownloadRequest(BaseModel):
    url: str = Field(..., description="下载链接")
    artist: Optional[str] = Field(None, description="歌手名")
    album: Optional[str] = Field(None, description="专辑名")


class DownloadResponse(BaseModel):
    id: int
    title: str
    artist: str
    album: str
    status: str
    file_path: str
    created_at: datetime

    class Config:
        from_attributes = True


class DownloadListResponse(BaseModel):
    total: int
    downloads: List[DownloadResponse]


# ==================== 在线音乐 Schemas ====================

class OnlineTrack(BaseModel):
    title: str
    artist: str
    album: str = ""
    duration: float = 0.0
    cover_url: str = ""
    preview_url: str = ""
    source: str = ""
    # Bilibili 字段
    bvid: str = ""
    aid: int = 0
    cid: int = 0
    url: str = ""
    source_url: str = ""
    # 酷狗字段
    hash: str = ""
    album_id: int = 0
    album_audio_id: int = 0


class OnlineTrackList(BaseModel):
    tracks: List[OnlineTrack]
    total: int


class ArtistInfo(BaseModel):
    name: str
    mbid: str = ""
    image_url: str = ""
    bio: str = ""
    similar_artists: List[str] = []


class AlbumInfo(BaseModel):
    title: str
    artist: str
    mbid: str = ""
    cover_url: str = ""
    tracks: List[str] = []
    release_date: str = ""


# ==================== 通用 Schemas ====================

class MessageResponse(BaseModel):
    message: str
    success: bool = True


class ScanResponse(BaseModel):
    total_scanned: int
    new_added: int
    updated: int
    errors: int
    message: str
