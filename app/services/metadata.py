"""音频元数据读写服务"""

from mutagen.mp3 import MP3
from mutagen.flac import FLAC
from mutagen.mp4 import MP4
from mutagen.oggvorbis import OggVorbis
from mutagen.id3 import ID3, TIT2, TPE1, TALB, TRCK, TPOS, APIC, USLT
from pathlib import Path
from typing import Optional, Dict, Any
import base64


class MetadataService:
    """音频元数据读写服务"""

    # 支持的音频格式
    SUPPORTED_FORMATS = {'.mp3', '.flac', '.m4a', '.ogg', '.wav', '.wma', '.aac'}

    @staticmethod
    def is_audio_file(file_path: Path) -> bool:
        """判断是否为支持的音频文件"""
        return file_path.suffix.lower() in MetadataService.SUPPORTED_FORMATS

    @staticmethod
    def read_metadata(file_path: Path) -> Optional[Dict[str, Any]]:
        """
        读取音频文件的元数据
        
        返回:
            {
                'title': str,
                'artist': str,
                'album': str,
                'track_number': int,
                'duration': float,
                'file_format': str,
                'file_size': int,
                'cover_data': bytes or None,
            }
        """
        try:
            suffix = file_path.suffix.lower()
            
            if suffix == '.mp3':
                return MetadataService._read_mp3(file_path)
            elif suffix == '.flac':
                return MetadataService._read_flac(file_path)
            elif suffix in ('.m4a', '.mp4'):
                return MetadataService._read_mp4(file_path)
            elif suffix == '.ogg':
                return MetadataService._read_ogg(file_path)
            else:
                # 尝试通用方法
                return MetadataService._read_generic(file_path)
        except Exception as e:
            print(f"Error reading metadata for {file_path}: {e}")
            return None

    @staticmethod
    def _read_mp3(file_path: Path) -> Dict[str, Any]:
        """读取 MP3 元数据"""
        audio = MP3(file_path)
        tags = ID3(file_path) if file_path.exists() else None
        
        metadata = {
            'title': '',
            'artist': '未知歌手',
            'album': '未知专辑',
            'track_number': 0,
            'duration': audio.info.length if audio.info else 0,
            'file_format': 'mp3',
            'file_size': file_path.stat().st_size,
            'cover_data': None,
        }
        
        if tags:
            metadata['title'] = str(tags.get('TIT2', '')) or file_path.stem
            metadata['artist'] = str(tags.get('TPE1', '')) or '未知歌手'
            metadata['album'] = str(tags.get('TALB', '')) or '未知专辑'
            
            # 音轨号
            track = tags.get('TRCK')
            if track:
                try:
                    metadata['track_number'] = int(str(track).split('/')[0])
                except (ValueError, IndexError):
                    pass
            
            # 封面
            apic = tags.get('APIC:cover') or tags.get('APIC:')
            if apic:
                metadata['cover_data'] = apic.data
        
        return metadata

    @staticmethod
    def _read_flac(file_path: Path) -> Dict[str, Any]:
        """读取 FLAC 元数据"""
        audio = FLAC(file_path)
        
        metadata = {
            'title': '',
            'artist': '未知歌手',
            'album': '未知专辑',
            'track_number': 0,
            'duration': audio.info.length if audio.info else 0,
            'file_format': 'flac',
            'file_size': file_path.stat().st_size,
            'cover_data': None,
        }
        
        if audio.tags:
            metadata['title'] = audio.tags.get('title', [file_path.stem])[0]
            metadata['artist'] = audio.tags.get('artist', ['未知歌手'])[0]
            metadata['album'] = audio.tags.get('album', ['未知专辑'])[0]
            
            # 音轨号
            track = audio.tags.get('tracknumber')
            if track:
                try:
                    metadata['track_number'] = int(track[0].split('/')[0])
                except (ValueError, IndexError):
                    pass
        
        # 封面
        if audio.pictures:
            metadata['cover_data'] = audio.pictures[0].data
        
        return metadata

    @staticmethod
    def _read_mp4(file_path: Path) -> Dict[str, Any]:
        """读取 M4A/MP4 元数据"""
        audio = MP4(file_path)
        
        metadata = {
            'title': '',
            'artist': '未知歌手',
            'album': '未知专辑',
            'track_number': 0,
            'duration': audio.info.length if audio.info else 0,
            'file_format': 'm4a',
            'file_size': file_path.stat().st_size,
            'cover_data': None,
        }
        
        if audio.tags:
            metadata['title'] = audio.tags.get('\xa9nam', [file_path.stem])[0]
            metadata['artist'] = audio.tags.get('\xa9ART', ['未知歌手'])[0]
            metadata['album'] = audio.tags.get('\xa9alb', ['未知专辑'])[0]
            
            # 音轨号
            track = audio.tags.get('trkn')
            if track:
                metadata['track_number'] = track[0][0]
            
            # 封面
            covr = audio.tags.get('covr')
            if covr:
                metadata['cover_data'] = covr[0]
        
        return metadata

    @staticmethod
    def _read_ogg(file_path: Path) -> Dict[str, Any]:
        """读取 OGG 元数据"""
        audio = OggVorbis(file_path)
        
        metadata = {
            'title': '',
            'artist': '未知歌手',
            'album': '未知专辑',
            'track_number': 0,
            'duration': audio.info.length if audio.info else 0,
            'file_format': 'ogg',
            'file_size': file_path.stat().st_size,
            'cover_data': None,
        }
        
        if audio.tags:
            metadata['title'] = audio.tags.get('title', [file_path.stem])[0]
            metadata['artist'] = audio.tags.get('artist', ['未知歌手'])[0]
            metadata['album'] = audio.tags.get('album', ['未知专辑'])[0]
            
            # 音轨号
            track = audio.tags.get('tracknumber')
            if track:
                try:
                    metadata['track_number'] = int(track[0].split('/')[0])
                except (ValueError, IndexError):
                    pass
        
        return metadata

    @staticmethod
    def _read_generic(file_path: Path) -> Dict[str, Any]:
        """通用元数据读取（使用文件名推断）"""
        return {
            'title': file_path.stem,
            'artist': '未知歌手',
            'album': '未知专辑',
            'track_number': 0,
            'duration': 0,
            'file_format': file_path.suffix[1:],
            'file_size': file_path.stat().st_size,
            'cover_data': None,
        }

    @staticmethod
    def write_metadata(file_path: Path, metadata: Dict[str, Any]) -> bool:
        """
        写入元数据到音频文件
        
        参数:
            file_path: 音频文件路径
            metadata: 要写入的元数据
        """
        try:
            suffix = file_path.suffix.lower()
            
            if suffix == '.mp3':
                return MetadataService._write_mp3(file_path, metadata)
            elif suffix == '.flac':
                return MetadataService._write_flac(file_path, metadata)
            elif suffix in ('.m4a', '.mp4'):
                return MetadataService._write_mp4(file_path, metadata)
            elif suffix == '.ogg':
                return MetadataService._write_ogg(file_path, metadata)
            else:
                return False
        except Exception as e:
            print(f"Error writing metadata for {file_path}: {e}")
            return False

    @staticmethod
    def _write_mp3(file_path: Path, metadata: Dict[str, Any]) -> bool:
        """写入 MP3 元数据"""
        try:
            tags = ID3(file_path)
        except Exception:
            tags = ID3()
        
        if 'title' in metadata:
            tags['TIT2'] = TIT2(encoding=3, text=metadata['title'])
        if 'artist' in metadata:
            tags['TPE1'] = TPE1(encoding=3, text=metadata['artist'])
        if 'album' in metadata:
            tags['TALB'] = TALB(encoding=3, text=metadata['album'])
        if 'track_number' in metadata:
            tags['TRCK'] = TRCK(encoding=3, text=str(metadata['track_number']))
        
        tags.save(file_path)
        return True

    @staticmethod
    def _write_flac(file_path: Path, metadata: Dict[str, Any]) -> bool:
        """写入 FLAC 元数据"""
        audio = FLAC(file_path)
        
        if 'title' in metadata:
            audio['title'] = metadata['title']
        if 'artist' in metadata:
            audio['artist'] = metadata['artist']
        if 'album' in metadata:
            audio['album'] = metadata['album']
        if 'track_number' in metadata:
            audio['tracknumber'] = str(metadata['track_number'])
        
        audio.save()
        return True

    @staticmethod
    def _write_mp4(file_path: Path, metadata: Dict[str, Any]) -> bool:
        """写入 M4A/MP4 元数据"""
        audio = MP4(file_path)
        
        if 'title' in metadata:
            audio['\xa9nam'] = metadata['title']
        if 'artist' in metadata:
            audio['\xa9ART'] = metadata['artist']
        if 'album' in metadata:
            audio['\xa9alb'] = metadata['album']
        if 'track_number' in metadata:
            audio['trkn'] = [(metadata['track_number'], 0)]
        
        audio.save()
        return True

    @staticmethod
    def _write_ogg(file_path: Path, metadata: Dict[str, Any]) -> bool:
        """写入 OGG 元数据"""
        audio = OggVorbis(file_path)
        
        if 'title' in metadata:
            audio['title'] = metadata['title']
        if 'artist' in metadata:
            audio['artist'] = metadata['artist']
        if 'album' in metadata:
            audio['album'] = metadata['album']
        if 'track_number' in metadata:
            audio['tracknumber'] = str(metadata['track_number'])
        
        audio.save()
        return True

    @staticmethod
    def save_cover(file_path: Path, cover_data: bytes) -> Optional[str]:
        """
        保存封面图片到文件（已弃用，保留兼容性）
        
        返回:
            空字符串
        """
        return ''

    @staticmethod
    def read_cover(file_path: Path) -> Optional[bytes]:
        """
        从音频文件读取封面数据
        
        返回:
            封面图片的字节数据，如果没有封面则返回 None
        """
        try:
            # 1. 先尝试从音频文件读取嵌入的封面
            suffix = file_path.suffix.lower()
            embedded_cover = None
            
            if suffix == '.mp3':
                embedded_cover = MetadataService._read_cover_mp3(file_path)
            elif suffix == '.flac':
                embedded_cover = MetadataService._read_cover_flac(file_path)
            elif suffix in ('.m4a', '.mp4'):
                embedded_cover = MetadataService._read_cover_mp4(file_path)
            elif suffix == '.ogg':
                embedded_cover = MetadataService._read_cover_ogg(file_path)
            
            if embedded_cover:
                return embedded_cover
            
            # 2. 如果没有嵌入封面，查找同目录下的封面文件
            return MetadataService._read_cover_from_directory(file_path)
        except Exception as e:
            print(f"Error reading cover from {file_path}: {e}")
            return None

    @staticmethod
    def _read_cover_from_directory(file_path: Path) -> Optional[bytes]:
        """
        从同目录下查找封面文件
        
        查找顺序：
        1. 与音频文件同名的图片（如 song.jpg, song.png）
        2. cover.jpg, cover.png
        3. folder.jpg, folder.png
        4. 目录中的第一个 jpg/png 文件
        """
        try:
            directory = file_path.parent
            stem = file_path.stem
            
            # 1. 查找与音频文件同名的图片
            for ext in ['.jpg', '.jpeg', '.png']:
                cover_file = directory / f"{stem}{ext}"
                if cover_file.exists():
                    return cover_file.read_bytes()
            
            # 2. 查找 cover.jpg, cover.png
            for name in ['cover', 'Cover', 'COVER']:
                for ext in ['.jpg', '.jpeg', '.png']:
                    cover_file = directory / f"{name}{ext}"
                    if cover_file.exists():
                        return cover_file.read_bytes()
            
            # 3. 查找 folder.jpg, folder.png
            for name in ['folder', 'Folder', 'FOLDER']:
                for ext in ['.jpg', '.jpeg', '.png']:
                    cover_file = directory / f"{name}{ext}"
                    if cover_file.exists():
                        return cover_file.read_bytes()
            
            # 4. 查找目录中的第一个图片文件
            for file in directory.iterdir():
                if file.suffix.lower() in ['.jpg', '.jpeg', '.png']:
                    return file.read_bytes()
            
            return None
        except Exception as e:
            print(f"Error reading cover from directory: {e}")
            return None

    @staticmethod
    def _read_cover_mp3(file_path: Path) -> Optional[bytes]:
        """读取 MP3 封面"""
        try:
            tags = ID3(file_path)
            apic = tags.get('APIC:cover') or tags.get('APIC:') or tags.get('APIC:front')
            if apic:
                return apic.data
        except Exception:
            pass
        return None

    @staticmethod
    def _read_cover_flac(file_path: Path) -> Optional[bytes]:
        """读取 FLAC 封面"""
        try:
            audio = FLAC(file_path)
            if audio.pictures:
                return audio.pictures[0].data
        except Exception:
            pass
        return None

    @staticmethod
    def _read_cover_mp4(file_path: Path) -> Optional[bytes]:
        """读取 M4A/MP4 封面"""
        try:
            audio = MP4(file_path)
            if audio.tags:
                covr = audio.tags.get('covr')
                if covr:
                    return covr[0]
        except Exception:
            pass
        return None

    @staticmethod
    def _read_cover_ogg(file_path: Path) -> Optional[bytes]:
        """读取 OGG 封面"""
        # OGG 封面通常存储在 metadata block picture 中
        # 需要使用 mutagen 的 ogg 模块
        try:
            from mutagen.oggvorbis import OggVorbis
            audio = OggVorbis(file_path)
            # OGG 文件中封面通常通过 base64 编码的 metadata block 存储
            # 这里简化处理，返回 None
            return None
        except Exception:
            return None


# 创建全局实例
metadata_service = MetadataService()
