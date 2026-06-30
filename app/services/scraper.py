"""音乐刮削服务 - 参考 music-tag-web"""

import httpx
import re
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any, List
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, TIT2, TPE1, TALB, TRCK, APIC, USLT
from mutagen.flac import FLAC
from mutagen.mp4 import MP4

from app.config import settings

# 网易云音乐 API
NETEASE_API = "https://music.163.com/api"
NETEASE_HEADERS = {
    "Referer": "https://music.163.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Cookie": "NMTID=00xxx; __remember_me=true",
}


class MusicScraper:
    """音乐刮削服务"""

    def __init__(self):
        self.music_root = Path(settings.MUSIC_ROOT)
        self.music_root.mkdir(parents=True, exist_ok=True)

    async def scrape_and_save(
        self,
        file_path: Path,
        track_info: Dict[str, Any],
        source: str = "bilibili",
        convert_to_mp3: bool = True,
    ) -> Dict[str, Any]:
        """
        刮削并保存音乐文件

        参数:
            file_path: 原始音频文件路径
            track_info: 歌曲信息（来自搜索结果）
            source: 音乐源
            convert_to_mp3: 是否转换为 mp3

        返回:
            {
                "file_path": str,
                "metadata": dict,
                "has_cover": bool,
                "has_lyrics": bool,
            }
        """
        # 1. 获取元数据
        metadata = self._build_metadata(track_info)

        # 2. 下载封面（从更高质量的源）
        cover_data = await self._download_cover(track_info)

        # 3. 获取歌词
        lyrics = await self._fetch_lyrics(
            metadata.get("title", ""),
            metadata.get("artist", ""),
            metadata.get("album", ""),
        )

        # 4. 确定保存路径
        save_path = self._get_save_path(metadata, file_path.suffix)

        # 5. 确保目录存在
        save_path.parent.mkdir(parents=True, exist_ok=True)

        # 6. 转换格式（如果需要）
        if convert_to_mp3 and file_path.suffix.lower() != ".mp3":
            converted_path = await self._convert_to_mp3(file_path)
            if converted_path:
                file_path = converted_path
                save_path = save_path.with_suffix(".mp3")

        # 7. 移动文件
        if file_path != save_path:
            import shutil
            shutil.move(str(file_path), str(save_path))

        # 8. 写入元数据
        self._write_metadata(save_path, metadata, cover_data, lyrics)

        return {
            "file_path": str(save_path),
            "metadata": metadata,
            "has_cover": cover_data is not None,
            "has_lyrics": lyrics is not None,
        }

    def _build_metadata(self, track_info: Dict[str, Any]) -> Dict[str, Any]:
        """构建元数据"""
        return {
            "title": track_info.get("title", "未知歌曲"),
            "artist": track_info.get("artist", "未知歌手"),
            "album": track_info.get("album", "未知专辑"),
            "track_number": track_info.get("track_number", 0),
            "duration": track_info.get("duration", 0),
        }

    def _get_save_path(self, metadata: Dict[str, Any], ext: str) -> Path:
        """生成标准保存路径：艺术家/专辑/歌曲名.ext"""
        artist = self._sanitize_filename(metadata.get("artist", "未知歌手"))
        album = self._sanitize_filename(metadata.get("album", "未知专辑"))
        title = self._sanitize_filename(metadata.get("title", "未知歌曲"))

        return self.music_root / artist / album / f"{title}{ext}"

    def _sanitize_filename(self, name: str) -> str:
        """清理文件名中的非法字符"""
        # 移除或替换非法字符
        illegal_chars = '<>:"/\\|?*'
        for char in illegal_chars:
            name = name.replace(char, '_')
        # 移除首尾空格
        return name.strip()

    async def _download_cover(self, track_info: Dict[str, Any]) -> Optional[bytes]:
        """下载封面图片"""
        cover_url = track_info.get("artwork", "")
        if not cover_url:
            return None

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(cover_url, timeout=10)
                if resp.status_code == 200:
                    return resp.content
        except Exception as e:
            print(f"Download cover error: {e}")

        return None

    async def _fetch_lyrics(
        self, title: str, artist: str, album: str = ""
    ) -> Optional[str]:
        """获取歌词"""
        # 从 LRCLIB 获取
        return await self._fetch_from_lrclib(title, artist, album)

    async def _fetch_from_lrclib(
        self, title: str, artist: str, album: str = ""
    ) -> Optional[str]:
        """从 LRCLIB 获取歌词"""
        try:
            url = "https://lrclib.net/api/get"
            params = {"track_name": title, "artist_name": artist}
            if album:
                params["album_name"] = album

            async with httpx.AsyncClient() as client:
                resp = await client.get(url, params=params, timeout=10)
                if resp.status_code == 200:
                    data = resp.json()
                    return data.get("syncedLyrics") or data.get("plainLyrics")
        except Exception as e:
            print(f"LRCLIB error: {e}")

        return None

    async def _convert_to_mp3(self, file_path: Path) -> Optional[Path]:
        """使用 ffmpeg 转换为 mp3"""
        try:
            mp3_path = file_path.with_suffix(".mp3")
            cmd = [
                "ffmpeg",
                "-i", str(file_path),
                "-codec:a", "libmp3lame",
                "-qscale:a", "2",  # 高质量 VBR
                "-y",  # 覆盖输出文件
                str(mp3_path),
            ]

            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=120
            )

            if result.returncode == 0 and mp3_path.exists():
                # 删除原文件
                file_path.unlink(missing_ok=True)
                return mp3_path
            else:
                print(f"FFmpeg error: {result.stderr}")
                return None
        except FileNotFoundError:
            print("FFmpeg not found, keeping original format")
            return None
        except Exception as e:
            print(f"Convert error: {e}")
            return None

    def _write_metadata(
        self,
        file_path: Path,
        metadata: Dict[str, Any],
        cover_data: Optional[bytes] = None,
        lyrics: Optional[str] = None,
    ):
        """写入元数据到音频文件"""
        try:
            suffix = file_path.suffix.lower()

            if suffix == ".mp3":
                self._write_mp3_metadata(file_path, metadata, cover_data, lyrics)
            elif suffix == ".flac":
                self._write_flac_metadata(file_path, metadata, cover_data, lyrics)
            elif suffix in (".m4a", ".mp4"):
                self._write_mp4_metadata(file_path, metadata, cover_data)
        except Exception as e:
            print(f"Write metadata error: {e}")

    def _write_mp3_metadata(
        self,
        file_path: Path,
        metadata: Dict[str, Any],
        cover_data: Optional[bytes] = None,
        lyrics: Optional[str] = None,
    ):
        """写入 MP3 元数据"""
        try:
            tags = ID3(file_path)
        except Exception:
            tags = ID3()

        tags["TIT2"] = TIT2(encoding=3, text=metadata.get("title", ""))
        tags["TPE1"] = TPE1(encoding=3, text=metadata.get("artist", ""))
        tags["TALB"] = TALB(encoding=3, text=metadata.get("album", ""))

        if metadata.get("track_number"):
            tags["TRCK"] = TRCK(encoding=3, text=str(metadata["track_number"]))

        # 写入封面
        if cover_data:
            tags["APIC"] = APIC(
                encoding=3,
                mime="image/jpeg",
                type=3,  # Front cover
                desc="Cover",
                data=cover_data,
            )

        # 写入歌词
        if lyrics:
            tags["USLT"] = USLT(
                encoding=3,
                lang="eng",
                desc="",
                text=lyrics,
            )

        tags.save(file_path)

    def _write_flac_metadata(
        self,
        file_path: Path,
        metadata: Dict[str, Any],
        cover_data: Optional[bytes] = None,
        lyrics: Optional[str] = None,
    ):
        """写入 FLAC 元数据"""
        audio = FLAC(file_path)

        audio["title"] = metadata.get("title", "")
        audio["artist"] = metadata.get("artist", "")
        audio["album"] = metadata.get("album", "")

        if metadata.get("track_number"):
            audio["tracknumber"] = str(metadata["track_number"])

        # 写入封面
        if cover_data:
            from mutagen.flac import Picture
            picture = Picture()
            picture.type = 3  # Front cover
            picture.mime = "image/jpeg"
            picture.desc = "Cover"
            picture.data = cover_data
            audio.clear_pictures()
            audio.add_picture(picture)

        # 写入歌词
        if lyrics:
            audio["lyrics"] = lyrics

        audio.save()

    def _write_mp4_metadata(
        self,
        file_path: Path,
        metadata: Dict[str, Any],
        cover_data: Optional[bytes] = None,
    ):
        """写入 M4A/MP4 元数据"""
        audio = MP4(file_path)

        audio["\xa9nam"] = metadata.get("title", "")
        audio["\xa9ART"] = metadata.get("artist", "")
        audio["\xa9alb"] = metadata.get("album", "")

        if metadata.get("track_number"):
            audio["trkn"] = [(metadata["track_number"], 0)]

        # 写入封面
        if cover_data:
            from mutagen.mp4 import MP4Cover
            audio["covr"] = [MP4Cover(cover_data, imageformat=MP4Cover.FORMAT_JPEG)]

        audio.save()


    # ========== 网易云音乐 API ==========

    async def search_netease(self, keyword: str, limit: int = 10, page: int = 1) -> List[Dict[str, Any]]:
        """
        搜索网易云音乐
        
        参数:
            keyword: 搜索关键词（歌曲标题 + 艺术家）
            limit: 返回结果数量
            page: 页码（从1开始）
        
        返回:
            候选歌曲列表
        """
        try:
            # 计算偏移量
            offset = (page - 1) * limit
            
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{NETEASE_API}/search/get",
                    params={"s": keyword, "type": 1, "limit": limit, "offset": offset},
                    headers=NETEASE_HEADERS,
                    timeout=10,
                )
                data = resp.json()
                songs = data.get("result", {}).get("songs", [])
                
                # 格式化结果
                results = []
                for song in songs:
                    artists = [a.get("name", "") for a in song.get("artists", [])]
                    album = song.get("album", {})
                    
                    # 搜索 API 不返回 picUrl，需要从详情 API 获取
                    cover_url = ""
                    song_id = song.get("id")
                    if song_id:
                        detail = await self.get_netease_detail(song_id)
                        if detail:
                            cover_url = detail.get("cover_url", "")
                    
                    results.append({
                        "id": song_id,
                        "title": song.get("name", ""),
                        "artist": ", ".join(artists),
                        "album": album.get("name", ""),
                        "cover_url": cover_url,
                        "duration": song.get("duration", 0) // 1000,  # 毫秒转秒
                    })
                
                return results
        except Exception as e:
            print(f"NetEase search error: {e}")
            return []

    async def get_netease_detail(self, song_id: int) -> Optional[Dict[str, Any]]:
        """
        获取网易云歌曲详情
        
        参数:
            song_id: 网易云歌曲 ID
        
        返回:
            歌曲详情（包含封面 URL）
        """
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{NETEASE_API}/song/detail",
                    params={"id": song_id, "ids": f"[{song_id}]"},
                    headers=NETEASE_HEADERS,
                    timeout=10,
                )
                data = resp.json()
                songs = data.get("songs", [])
                if not songs:
                    return None
                
                song = songs[0]
                album = song.get("album", {})
                artists = [a.get("name", "") for a in song.get("artists", [])]
                album_artists = [a.get("name", "") for a in album.get("artists", [])]
                
                return {
                    "id": song.get("id"),
                    "title": song.get("name", ""),
                    "artist": ", ".join(artists),
                    "album": album.get("name", ""),
                    "album_artist": ", ".join(album_artists),
                    "cover_url": album.get("picUrl", ""),
                    "duration": song.get("duration", 0) // 1000,
                    "track_number": album.get("no", 0),
                    "publish_time": album.get("publishTime", 0),
                }
        except Exception as e:
            print(f"NetEase detail error: {e}")
            return None

    async def get_netease_lyrics(self, song_id: int) -> Optional[str]:
        """
        获取网易云歌词
        
        参数:
            song_id: 网易云歌曲 ID
        
        返回:
            LRC 格式歌词
        """
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{NETEASE_API}/song/lyric",
                    params={"id": song_id, "lv": -1, "tv": -1},
                    headers=NETEASE_HEADERS,
                    timeout=10,
                )
                data = resp.json()
                lrc = data.get("lrc", {}).get("lyric", "")
                return lrc if lrc else None
        except Exception as e:
            print(f"NetEase lyrics error: {e}")
            return None

    async def download_cover(self, cover_url: str) -> Optional[bytes]:
        """
        下载封面图片
        
        参数:
            cover_url: 封面 URL
        
        返回:
            封面图片二进制数据
        """
        if not cover_url:
            return None
        
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(cover_url, timeout=10)
                if resp.status_code == 200:
                    return resp.content
        except Exception as e:
            print(f"Download cover error: {e}")
        
        return None

    async def scrape_for_existing_song(
        self,
        file_path: Path,
        netease_id: int,
        original_metadata: dict = None,
        write_cover: bool = True,
        write_lyrics: bool = True,
        write_title: bool = True,
        write_artist: bool = True,
        write_album: bool = True,
    ) -> Dict[str, Any]:
        """
        为已存在的歌曲刮削元数据
        
        参数:
            file_path: 音频文件路径
            netease_id: 网易云歌曲 ID
            write_cover: 是否写入封面
            write_lyrics: 是否写入歌词
            write_title: 是否写入标题
            write_artist: 是否写入歌手
            write_album: 是否写入专辑
        
        返回:
            刮削结果
        """
        # 1. 获取歌曲详情
        detail = await self.get_netease_detail(netease_id)
        if not detail:
            return {"success": False, "error": "无法获取歌曲详情"}
        
        # 2. 下载封面
        cover_data = None
        if write_cover and detail.get("cover_url"):
            cover_data = await self.download_cover(detail["cover_url"])
        
        # 3. 获取歌词
        lyrics = None
        if write_lyrics:
            lyrics = await self.get_netease_lyrics(netease_id)
        
        # 4. 构建元数据（根据选项）
        metadata = {}
        if write_title:
            metadata["title"] = detail.get("title", "")
        if write_artist:
            metadata["artist"] = detail.get("artist", "")
        if write_album:
            metadata["album"] = detail.get("album", "")
        
        # 只有有元数据时才写入
        if metadata or cover_data or lyrics:
            try:
                self._write_metadata(file_path, metadata, cover_data, lyrics)
            except Exception as e:
                return {"success": False, "error": f"写入元数据失败: {e}"}
        
        # 5. 保存封面文件（独立文件）
        cover_path = None
        if write_cover and cover_data:
            cover_path = file_path.parent / f"{file_path.stem}.jpg"
            try:
                cover_path.write_bytes(cover_data)
            except Exception as e:
                print(f"Save cover file error: {e}")
        
        # 6. 保存歌词文件（独立文件）
        lyrics_path = None
        if write_lyrics and lyrics:
            lyrics_path = file_path.parent / f"{file_path.stem}.lrc"
            try:
                lyrics_path.write_text(lyrics, encoding="utf-8")
            except Exception as e:
                print(f"Save lyrics file error: {e}")
        
        # 7. 重命名文件（移动到 artist/album/ 目录）
        new_file_path = file_path
        new_cover_path = cover_path
        new_lyrics_path = lyrics_path
        
        try:
            # 计算新路径（未勾选的字段用原值）
            original = original_metadata or {}
            path_metadata = {
                "title": detail.get("title") if write_title else original.get("title", ""),
                "artist": detail.get("artist") if write_artist else original.get("artist", ""),
                "album": detail.get("album") if write_album else original.get("album", ""),
            }
            target_path = self._get_save_path(path_metadata, file_path.suffix)
            
            # 如果目标路径与当前路径不同，移动文件
            if target_path.resolve() != file_path.resolve():
                # 检查目标文件是否已存在
                if target_path.exists():
                    return {
                        "success": False,
                        "error": f"目标文件已存在: {target_path.name}",
                    }
                
                # 创建目录
                target_path.parent.mkdir(parents=True, exist_ok=True)
                
                # 移动音频文件
                import shutil
                shutil.move(str(file_path), str(target_path))
                new_file_path = target_path
                
                # 移动封面文件
                if cover_path and cover_path.exists():
                    new_cover = target_path.parent / f"{target_path.stem}.jpg"
                    shutil.move(str(cover_path), str(new_cover))
                    new_cover_path = new_cover
                
                # 移动歌词文件
                if lyrics_path and lyrics_path.exists():
                    new_lyrics = target_path.parent / f"{target_path.stem}.lrc"
                    shutil.move(str(lyrics_path), str(new_lyrics))
                    new_lyrics_path = new_lyrics
                
                print(f"文件已移动: {file_path} -> {target_path}")
        except Exception as e:
            print(f"文件移动失败: {e}")
            # 文件移动失败不影响刮削结果
        
        return {
            "success": True,
            "title": detail.get("title", ""),
            "artist": detail.get("artist", ""),
            "album": detail.get("album", ""),
            "cover_url": detail.get("cover_url", ""),
            "has_cover": cover_data is not None,
            "has_lyrics": lyrics is not None,
            "file_path": str(new_file_path),
            "cover_path": str(new_cover_path) if new_cover_path else None,
            "lyrics_path": str(new_lyrics_path) if new_lyrics_path else None,
        }


# 创建全局实例
music_scraper = MusicScraper()
