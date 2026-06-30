"""插件管理器"""

from typing import Dict, List, Any, Optional
from app.plugins.base import MusicPlugin
from app.plugins.bilibili import bilibili_plugin


class PluginManager:
    """
    插件管理器
    
    参考 MusicFree 的插件管理机制，统一管理所有音乐源插件
    """

    def __init__(self):
        self.plugins: Dict[str, MusicPlugin] = {}
        self._load_plugins()

    def _load_plugins(self):
        """加载所有内置插件"""
        self.register_plugin(bilibili_plugin)

    def register_plugin(self, plugin: MusicPlugin):
        """注册插件"""
        self.plugins[plugin.platform] = plugin
        print(f"Loaded plugin: {plugin.platform} v{plugin.version}")

    def get_plugin(self, platform: str) -> Optional[MusicPlugin]:
        """获取指定插件"""
        return self.plugins.get(platform)

    async def search(
        self,
        platform: str,
        query: str,
        page: int = 1,
        type: str = "music",
    ) -> Dict[str, Any]:
        """
        调用指定插件的搜索方法
        
        参数:
            platform: 插件名称 (kugou, bilibili)
            query: 搜索关键词
            page: 页码
            type: 搜索类型 (music/album/artist/sheet/lyric)
        """
        plugin = self.plugins.get(platform)
        if not plugin:
            raise ValueError(f"Unknown plugin: {platform}")
        
        # 检查插件是否支持该搜索类型
        if type not in plugin.supported_search_type:
            return {
                "isEnd": True,
                "data": [],
                "message": f"Plugin {platform} does not support search type: {type}",
            }
        
        return await plugin.search(query, page, type)

    async def get_media_source(
        self,
        platform: str,
        media_item: Dict[str, Any],
        quality: str = "standard",
    ) -> Optional[Dict[str, Any]]:
        """
        调用指定插件的获取音源方法
        
        参数:
            platform: 插件名称
            media_item: 歌曲信息
            quality: 音质 (low/standard/high/super)
        """
        plugin = self.plugins.get(platform)
        if not plugin:
            raise ValueError(f"Unknown plugin: {platform}")
        
        return await plugin.get_media_source(media_item, quality)

    async def get_lyric(
        self,
        platform: str,
        media_item: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """
        调用指定插件的获取歌词方法
        
        参数:
            platform: 插件名称
            media_item: 歌曲信息
        """
        plugin = self.plugins.get(platform)
        if not plugin:
            raise ValueError(f"Unknown plugin: {platform}")
        
        return await plugin.get_lyric(media_item)

    async def get_album_info(
        self,
        platform: str,
        album_item: Dict[str, Any],
        page: int = 1,
    ) -> Optional[Dict[str, Any]]:
        """
        调用指定插件的获取专辑详情方法
        
        参数:
            platform: 插件名称
            album_item: 专辑信息
            page: 页码
        """
        plugin = self.plugins.get(platform)
        if not plugin:
            raise ValueError(f"Unknown plugin: {platform}")
        
        return await plugin.get_album_info(album_item, page)

    async def get_top_lists(
        self,
        platform: str,
    ) -> Optional[List[Dict[str, Any]]]:
        """
        调用指定插件的获取榜单列表方法
        
        参数:
            platform: 插件名称
        """
        plugin = self.plugins.get(platform)
        if not plugin:
            raise ValueError(f"Unknown plugin: {platform}")
        
        return await plugin.get_top_lists()

    async def get_top_list_detail(
        self,
        platform: str,
        top_item: Dict[str, Any],
        page: int = 1,
    ) -> Optional[Dict[str, Any]]:
        """
        调用指定插件的获取榜单详情方法
        
        参数:
            platform: 插件名称
            top_item: 榜单信息
            page: 页码
        """
        plugin = self.plugins.get(platform)
        if not plugin:
            raise ValueError(f"Unknown plugin: {platform}")
        
        return await plugin.get_top_list_detail(top_item, page)

    def get_plugins_info(self) -> List[Dict[str, Any]]:
        """获取所有插件信息"""
        return [
            {
                "id": p.platform,
                "name": p.platform,
                "version": p.version,
                "author": p.author,
                "supportedSearchType": p.supported_search_type,
            }
            for p in self.plugins.values()
        ]

    def get_supported_search_types(self, platform: str) -> List[str]:
        """获取指定插件支持的搜索类型"""
        plugin = self.plugins.get(platform)
        if not plugin:
            return []
        return plugin.supported_search_type


# 全局实例
plugin_manager = PluginManager()
