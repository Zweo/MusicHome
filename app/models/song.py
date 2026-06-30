from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship
from datetime import datetime

from app.db import Base

# 播放列表-歌曲关联表
playlist_songs = Table(
    "playlist_songs",
    Base.metadata,
    Column("playlist_id", Integer, ForeignKey("playlists.id"), primary_key=True),
    Column("song_id", Integer, ForeignKey("songs.id"), primary_key=True),
    Column("position", Integer, default=0),
)


class Song(Base):
    """本地歌曲模型（统一管理本地歌曲和下载歌曲）"""
    __tablename__ = "songs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String, nullable=False)
    artist = Column(String, default="未知歌手")
    album = Column(String, default="未知专辑")
    track_number = Column(Integer, default=0)
    duration = Column(Float, default=0.0)  # 秒
    file_path = Column(String, nullable=False)
    file_format = Column(String)  # mp3, flac, etc.
    file_size = Column(Integer, default=0)  # bytes
    cover_path = Column(String, default="")  # 封面图路径
    liked = Column(Integer, default=0)  # 0: 未收藏, 1: 已收藏
    play_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # 下载相关字段
    source_url = Column(String, default="")  # 来源 URL（下载的歌曲）
    status = Column(String, default="completed")  # pending, downloading, completed, failed
    error_message = Column(String, default="")  # 错误信息
    completed_at = Column(DateTime, nullable=True)  # 完成时间

    # 关系
    playlists = relationship("Playlist", secondary=playlist_songs, back_populates="songs")

    def __repr__(self):
        return f"<Song(id={self.id}, title='{self.title}', artist='{self.artist}')>"


class Playlist(Base):
    """播放列表模型"""
    __tablename__ = "playlists"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    description = Column(String, default="")
    cover_path = Column(String, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    songs = relationship("Song", secondary=playlist_songs, back_populates="playlists")

    def __repr__(self):
        return f"<Playlist(id={self.id}, name='{self.name}')>"
