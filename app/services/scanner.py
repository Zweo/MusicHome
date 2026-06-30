"""本地音乐目录扫描服务"""

from pathlib import Path
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import asyncio
import hashlib
from concurrent.futures import ThreadPoolExecutor

from app.models.song import Song
from app.services.metadata import metadata_service
from app.config import settings

# 线程池执行器，用于执行同步 I/O 操作
_executor = ThreadPoolExecutor(max_workers=2)


class MusicScanner:
    """音乐目录扫描器"""

    def __init__(self, music_root: Optional[str] = None):
        self.music_root = Path(music_root or settings.MUSIC_ROOT)
        self._is_scanning = False
        self._progress = {
            'total_scanned': 0,
            'new_added': 0,
            'updated': 0,
            'errors': 0,
            'total_files': 0,
            'is_scanning': False,
            'current_file': '',
        }

    @property
    def progress(self) -> Dict[str, Any]:
        """获取当前扫描进度"""
        return self._progress.copy()

    async def scan(self, db: AsyncSession) -> Dict[str, int]:
        """
        扫描音乐目录
        
        返回:
            {
                'total_scanned': 扫描的文件总数,
                'new_added': 新增的歌曲数,
                'updated': 更新的歌曲数,
                'errors': 出错的文件数,
            }
        """
        if self._is_scanning:
            return self._progress

        self._is_scanning = True
        self._progress = {
            'total_scanned': 0,
            'new_added': 0,
            'updated': 0,
            'errors': 0,
            'total_files': 0,
            'is_scanning': True,
            'current_file': '',
        }

        stats = {
            'total_scanned': 0,
            'new_added': 0,
            'updated': 0,
            'errors': 0,
        }

        if not self.music_root.exists():
            self._is_scanning = False
            self._progress['is_scanning'] = False
            return stats

        # 先计算总文件数（使用线程池避免阻塞事件循环）
        loop = asyncio.get_event_loop()
        audio_files = await loop.run_in_executor(
            _executor, list, self._iter_audio_files()
        )
        self._progress['total_files'] = len(audio_files)

        print(f"开始扫描音乐目录，共 {len(audio_files)} 个文件")

        # 遍历所有音频文件
        for file_path in audio_files:
            stats['total_scanned'] += 1
            self._progress['total_scanned'] = stats['total_scanned']
            self._progress['current_file'] = file_path.name
            
            # 每 100 个文件打印一次进度
            if stats['total_scanned'] % 100 == 0:
                print(f"扫描进度: {stats['total_scanned']}/{len(audio_files)}")
            
            try:
                result = await self._process_file(db, file_path)
                if result == 'new':
                    stats['new_added'] += 1
                    self._progress['new_added'] = stats['new_added']
                elif result == 'updated':
                    stats['updated'] += 1
                    self._progress['updated'] = stats['updated']
            except Exception as e:
                # 只打印关键错误，不打印每个文件的错误
                if stats['errors'] < 5:  # 只打印前5个错误
                    print(f"Error processing {file_path}: {e}")
                stats['errors'] += 1
                self._progress['errors'] = stats['errors']

            # 让出控制权，允许其他任务执行
            await asyncio.sleep(0)

        await db.commit()
        
        print(f"扫描完成: 新增 {stats['new_added']} 首，更新 {stats['updated']} 首，跳过 {stats['total_scanned'] - stats['new_added'] - stats['updated']} 首")
        
        self._is_scanning = False
        self._progress['is_scanning'] = False
        self._progress['current_file'] = ''
        
        return stats

    def _iter_audio_files(self):
        """遍历所有音频文件"""
        for file_path in self.music_root.rglob('*'):
            if file_path.is_file() and metadata_service.is_audio_file(file_path):
                yield file_path

    async def _process_file(self, db: AsyncSession, file_path: Path) -> str:
        """
        处理单个音频文件
        
        返回:
            'new': 新增
            'updated': 更新
            'unchanged': 未变化
        """
        loop = asyncio.get_event_loop()
        
        # 检查是否已存在
        result = await db.execute(
            select(Song).where(Song.file_path == str(file_path))
        )
        existing_song = result.scalar_one_or_none()

        # 获取文件修改时间（使用线程池避免阻塞）
        file_mtime = await loop.run_in_executor(
            _executor, lambda: file_path.stat().st_mtime
        )

        if existing_song:
            # 检查文件是否被修改（使用文件修改时间）
            # 如果数据库记录的时间 >= 文件修改时间，说明文件未修改
            if existing_song.updated_at:
                db_mtime = existing_song.updated_at.timestamp()
                if db_mtime >= file_mtime:
                    return 'unchanged'  # 文件未修改，跳过
            
            # 文件有变动，读取元数据（使用线程池避免阻塞）
            metadata = await loop.run_in_executor(
                _executor, metadata_service.read_metadata, file_path
            )
            if not metadata:
                raise Exception("Failed to read metadata")

            # 查找封面文件（直接查找同名图片）
            cover_path = self._find_cover_file(file_path)

            # 更新现有记录
            existing_song.title = metadata['title']
            existing_song.artist = metadata['artist']
            existing_song.album = metadata['album']
            existing_song.track_number = metadata['track_number']
            existing_song.duration = metadata['duration']
            existing_song.file_format = metadata['file_format']
            existing_song.file_size = metadata['file_size']
            if cover_path:
                existing_song.cover_path = cover_path
            return 'updated'
        else:
            # 新文件，读取元数据（使用线程池避免阻塞）
            metadata = await loop.run_in_executor(
                _executor, metadata_service.read_metadata, file_path
            )
            if not metadata:
                raise Exception("Failed to read metadata")

            # 查找封面文件（直接查找同名图片）
            cover_path = self._find_cover_file(file_path)

            # 创建新记录
            # 从目录结构推断歌手和专辑（如果元数据缺失）
            artist, album = self._infer_artist_album(file_path, metadata)
            
            new_song = Song(
                title=metadata['title'],
                artist=artist,
                album=album,
                track_number=metadata['track_number'],
                duration=metadata['duration'],
                file_path=str(file_path),
                file_format=metadata['file_format'],
                file_size=metadata['file_size'],
                cover_path=cover_path,
            )
            db.add(new_song)
            return 'new'

    def _find_cover_file(self, file_path: Path) -> str:
        """
        查找封面文件（直接查找同名图片，不从音频文件提取）
        
        查找顺序：
        1. 与音频文件同名的图片（如 song.jpg, song.png）
        2. cover.jpg, cover.png
        3. folder.jpg, folder.png
        
        返回:
            封面的相对路径，如果没有找到返回空字符串
        """
        try:
            directory = file_path.parent
            stem = file_path.stem
            
            # 1. 查找与音频文件同名的图片
            for ext in ['.jpg', '.jpeg', '.png']:
                cover_file = directory / f"{stem}{ext}"
                if cover_file.exists():
                    # 返回相对于音乐根目录的路径
                    return str(cover_file.relative_to(self.music_root))
            
            # 2. 查找 cover.jpg, cover.png
            for name in ['cover', 'Cover', 'COVER']:
                for ext in ['.jpg', '.jpeg', '.png']:
                    cover_file = directory / f"{name}{ext}"
                    if cover_file.exists():
                        return str(cover_file.relative_to(self.music_root))
            
            # 3. 查找 folder.jpg, folder.png
            for name in ['folder', 'Folder', 'FOLDER']:
                for ext in ['.jpg', '.jpeg', '.png']:
                    cover_file = directory / f"{name}{ext}"
                    if cover_file.exists():
                        return str(cover_file.relative_to(self.music_root))
            
            return ''
        except Exception as e:
            print(f"Error finding cover for {file_path}: {e}")
            return ''

    def _infer_artist_album(self, file_path: Path, metadata: Dict[str, Any]) -> tuple:
        """
        从目录结构推断歌手和专辑
        
        目录结构: root/artist/album/song.mp3
        """
        try:
            # 获取相对路径
            rel_path = file_path.relative_to(self.music_root)
            parts = rel_path.parts
            
            artist = metadata.get('artist', '未知歌手')
            album = metadata.get('album', '未知专辑')
            
            # 如果元数据中没有歌手信息，从目录结构推断
            if artist == '未知歌手' and len(parts) >= 2:
                artist = parts[0]
            
            # 如果元数据中没有专辑信息，从目录结构推断
            if album == '未知专辑' and len(parts) >= 3:
                album = parts[1]
            
            return artist, album
        except Exception:
            return metadata.get('artist', '未知歌手'), metadata.get('album', '未知专辑')

    def get_directory_stats(self) -> Dict[str, Any]:
        """获取目录统计信息"""
        if not self.music_root.exists():
            return {
                'exists': False,
                'total_files': 0,
                'total_size': 0,
                'formats': {},
            }

        total_files = 0
        total_size = 0
        formats = {}

        for file_path in self._iter_audio_files():
            total_files += 1
            total_size += file_path.stat().st_size
            
            suffix = file_path.suffix.lower()
            formats[suffix] = formats.get(suffix, 0) + 1

        return {
            'exists': True,
            'total_files': total_files,
            'total_size': total_size,
            'formats': formats,
        }


# 创建全局实例
music_scanner = MusicScanner()
