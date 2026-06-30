"""插件基类 - 参考 MusicFree 插件协议"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional


class MusicPlugin(ABC):
    """
    音乐插件基类
    
    参考 MusicFree 插件协议:
    https://musicfree.catcat.work/plugin/protocol.html
    """

    # 插件名称
    platform: str = ""
    # 插件版本
    version: str = "0.0.0"
    # 插件作者
    author: str = ""
    # 支持的搜索类型: music, album, artist, sheet, lyric
    supported_search_type: List[str] = ["music"]
    # 缓存策略: cache, no-cache, no-store
    cache_control: str = "no-cache"

    @abstractmethod
    async def search(
        self,
        query: str,
        page: int = 1,
        type: str = "music",
    ) -> Dict[str, Any]:
        """
        搜索音乐
        
        参数:
            query: 搜索关键词
            page: 页码 (从 1 开始)
            type: 搜索类型 (music/album/artist/sheet/lyric)
            
        返回:
            {
                "isEnd": bool,  # 是否最后一页
                "data": List[Dict]  # 搜索结果列表
            }
        """
        pass

    @abstractmethod
    async def get_media_source(
        self,
        media_item: Dict[str, Any],
        quality: str = "standard",
    ) -> Optional[Dict[str, Any]]:
        """
        获取音频流 URL
        
        参数:
            media_item: 歌曲信息 (MusicItem 类型的 dict)
            quality: 音质 (low/standard/high/super)
            
        返回:
            {
                "url": str,  # 音频 URL
                "headers": dict,  # 请求头 (可选)
                "userAgent": str,  # User-Agent (可选)
            }
            或 None (获取失败)
        """
        pass

    async def get_lyric(
        self,
        media_item: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """
        获取歌词 (可选)
        
        参数:
            media_item: 歌曲信息
            
        返回:
            {
                "rawLrc": str,  # LRC 格式歌词
                "translation": str,  # 翻译歌词 (可选)
            }
            或 None
        """
        return None

    async def get_music_info(
        self,
        music_item: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """
        获取音乐详情 (可选)
        
        参数:
            music_item: 歌曲基础信息
            
        返回:
            补充的歌曲信息字段
            或 None
        """
        return None

    async def get_album_info(
        self,
        album_item: Dict[str, Any],
        page: int = 1,
    ) -> Optional[Dict[str, Any]]:
        """
        获取专辑详情 (可选)
        
        参数:
            album_item: 专辑基础信息
            page: 页码
            
        返回:
            {
                "isEnd": bool,
                "musicList": List[Dict],
                "albumItem": Dict (可选，补充专辑信息)
            }
            或 None
        """
        return None

    async def get_top_lists(self) -> Optional[List[Dict[str, Any]]]:
        """
        获取榜单列表 (可选)
        
        返回:
            [
                {
                    "title": str,  # 分组名
                    "data": List[Dict]  # 榜单列表
                }
            ]
            或 None
        """
        return None

    async def get_top_list_detail(
        self,
        top_item: Dict[str, Any],
        page: int = 1,
    ) -> Optional[Dict[str, Any]]:
        """
        获取榜单详情 (可选)
        
        参数:
            top_item: 榜单基础信息
            page: 页码
            
        返回:
            {
                "isEnd": bool,
                "musicList": List[Dict]
            }
            或 None
        """
        return None
