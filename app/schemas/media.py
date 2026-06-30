"""基础媒体类型 - 参考 MusicFree 插件协议"""

from pydantic import BaseModel, Field
from typing import Optional, List, Any


class MediaBase(BaseModel):
    """媒体基础类型"""
    platform: str = ""  # 媒体来源
    id: str = ""  # 媒体ID

    class Config:
        extra = "allow"


class MusicItem(MediaBase):
    """音乐类型"""
    artist: str = ""  # 作者
    title: str = ""  # 歌曲标题
    duration: float = 0.0  # 时长(s)
    album: str = ""  # 专辑名
    artwork: str = ""  # 专辑封面图
    url: str = ""  # 默认音源
    lrc: str = ""  # 歌词URL
    rawLrc: str = ""  # 歌词文本

    # 酷狗扩展字段
    hash: str = ""
    album_id: int = 0
    album_audio_id: int = 0

    # B站扩展字段
    bvid: str = ""
    aid: int = 0
    cid: int = 0

    class Config:
        extra = "allow"


class AlbumItem(MediaBase):
    """专辑类型"""
    artwork: str = ""
    title: str = ""
    description: str = ""
    worksNum: int = 0
    playCount: int = 0
    artist: str = ""
    musicList: List[MusicItem] = []

    class Config:
        extra = "allow"


class ArtistItem(MediaBase):
    """作者类型"""
    name: str = ""
    fans: int = 0
    description: str = ""
    avatar: str = ""

    class Config:
        extra = "allow"


class MusicSheetItem(MediaBase):
    """歌单类型"""
    title: str = ""
    artist: str = ""
    artwork: str = ""
    description: str = ""
    playCount: int = 0
    musicList: List[MusicItem] = []

    class Config:
        extra = "allow"


class SearchResult(BaseModel):
    """搜索结果"""
    isEnd: bool = True
    data: List[MusicItem] = []


class MediaSourceResult(BaseModel):
    """音源结果"""
    url: str = ""
    headers: Optional[dict] = None
    userAgent: Optional[str] = None


class LyricResult(BaseModel):
    """歌词结果"""
    rawLrc: Optional[str] = None
    translation: Optional[str] = None


class TopListGroup(BaseModel):
    """榜单分组"""
    title: str = ""
    data: List[MusicSheetItem] = []
