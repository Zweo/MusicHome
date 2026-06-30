"""Bilibili 音乐插件"""

import httpx
import re
import asyncio
import time
from typing import List, Dict, Any, Optional
from urllib.parse import quote
from app.plugins.base import MusicPlugin


class BilibiliPlugin(MusicPlugin):
    """Bilibili 音乐插件"""

    platform = "bilibili"
    version = "0.3.0"
    author = "MusicHome"
    supported_search_type = ["music", "album", "artist"]

    BASE_URL = "https://api.bilibili.com"
    UA = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    )

    def __init__(self):
        self.cookie: Optional[str] = None
        self.headers = {
            "user-agent": self.UA,
            "accept": "application/json, text/plain, */*",
            "accept-encoding": "gzip, deflate",  # 禁用 Brotli 压缩
            "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
            "origin": "https://search.bilibili.com",
            "referer": "https://search.bilibili.com/",
            "sec-fetch-site": "same-site",
            "sec-fetch-mode": "cors",
            "sec-fetch-dest": "empty",
        }
        self._last_request_time = 0

    async def _get_cookie(self) -> str:
        """获取 Bilibili cookie"""
        if not self.cookie:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{self.BASE_URL}/x/frontend/finger/spi",
                    headers={"User-Agent": self.UA},
                )
                data = resp.json()["data"]
                self.cookie = f"buvid3={data['b_3']};buvid4={data['b_4']}"
        return self.cookie

    async def _rate_limit(self):
        """请求间隔控制"""
        now = time.time()
        elapsed = now - self._last_request_time
        if elapsed < 0.5:
            await asyncio.sleep(0.5 - elapsed)
        self._last_request_time = time.time()

    def _clean_html(self, text: str) -> str:
        """清理 HTML 标签"""
        return re.sub(r"<[^>]+>", "", text)

    def _fix_url(self, url: str) -> str:
        """修复 URL"""
        if url.startswith("//"):
            return f"https:{url}"
        return url

    def _parse_duration(self, duration) -> int:
        """解析时长"""
        if isinstance(duration, (int, float)):
            return int(duration)
        try:
            parts = str(duration).split(":")
            if len(parts) == 2:
                return int(parts[0]) * 60 + int(parts[1])
            elif len(parts) == 3:
                return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
            return 0
        except Exception:
            return 0

    async def _get_cid(self, bvid: str, aid: int = 0) -> int:
        """获取视频 cid"""
        params = {"bvid": bvid} if bvid else {"aid": aid}
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{self.BASE_URL}/x/web-interface/view",
                params=params,
                headers=self.headers,
                timeout=10.0,
            )
            data = resp.json()
            if data["code"] == 0:
                return data["data"]["cid"]
            return 0

    async def search(
        self,
        query: str,
        page: int = 1,
        type: str = "music",
    ) -> Dict[str, Any]:
        """搜索 Bilibili 视频"""
        if type == "artist":
            return await self._search_artist(query, page)
        return await self._search_video(query, page)

    async def _search_video(self, query: str, page: int = 1) -> Dict[str, Any]:
        """搜索视频，展开分P视频"""
        try:
            await self._rate_limit()
            cookie = await self._get_cookie()

            params = {
                "keyword": query,
                "search_type": "video",
                "page": page,
                "page_size": 20,
                "platform": "pc",
                "order": "",
                "duration": "",
                "tids_1": "",
                "tids_2": "",
                "__refresh__": True,
                "_extra": "",
                "highlight": 1,
                "single_column": 0,
            }

            # 重试机制
            for retry in range(3):
                async with httpx.AsyncClient() as client:
                    resp = await client.get(
                        f"{self.BASE_URL}/x/web-interface/search/type",
                        params=params,
                        headers={**self.headers, "cookie": cookie},
                        timeout=10.0,
                    )
                    data = resp.json()

                    if data["code"] == 0:
                        break
                    elif data["code"] == -412:
                        print(f"Bilibili search banned, retry {retry + 1}/3")
                        await asyncio.sleep(3 * (retry + 1))
                        self.cookie = None
                        cookie = await self._get_cookie()
                    else:
                        print(f"Bilibili search error: {data.get('message', '')}")
                        return {"isEnd": True, "data": []}

            tracks = []
            for item in data.get("data", {}).get("result", []):
                bvid = item.get("bvid", "")
                aid = item.get("aid")

                # 获取视频分P信息
                pages = await self.get_video_pages(bvid)

                if len(pages) > 1:
                    for i, p in enumerate(pages):
                        tracks.append({
                            "platform": self.platform,
                            "id": f"{bvid}_p{i+1}",
                            "title": f"{self._clean_html(item['title'])} - P{i+1}: {p['title']}",
                            "artist": item.get("author", ""),
                            "album": bvid,
                            "duration": p["duration"],
                            "artwork": self._fix_url(item.get("pic", "")),
                            "bvid": bvid,
                            "aid": aid,
                            "cid": p["cid"],
                            "url": f"https://www.bilibili.com/video/{bvid}?p={i+1}",
                        })
                else:
                    cid = pages[0]["cid"] if pages else None
                    tracks.append({
                        "platform": self.platform,
                        "id": bvid,
                        "title": self._clean_html(item["title"]),
                        "artist": item.get("author", ""),
                        "album": bvid,
                        "duration": self._parse_duration(item.get("duration", "")),
                        "artwork": self._fix_url(item.get("pic", "")),
                        "bvid": bvid,
                        "aid": aid,
                        "cid": cid,
                        "url": f"https://www.bilibili.com/video/{bvid}",
                    })

            num_results = data.get("data", {}).get("numResults", 0)
            is_end = page * 20 >= num_results

            return {"isEnd": is_end, "data": tracks}
        except Exception as e:
            print(f"Bilibili search error: {e}")
            return {"isEnd": True, "data": []}

    async def _search_artist(self, query: str, page: int = 1) -> Dict[str, Any]:
        """搜索用户"""
        try:
            await self._rate_limit()
            cookie = await self._get_cookie()

            params = {
                "keyword": query,
                "search_type": "bili_user",
                "page": page,
                "page_size": 20,
                "platform": "pc",
            }

            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{self.BASE_URL}/x/web-interface/search/type",
                    params=params,
                    headers={**self.headers, "cookie": cookie},
                    timeout=10.0,
                )
                data = resp.json()

                if data["code"] != 0:
                    return {"isEnd": True, "data": []}

                artists = []
                for item in data.get("data", {}).get("result", []):
                    artists.append({
                        "platform": self.platform,
                        "id": str(item.get("mid", "")),
                        "name": item.get("uname", ""),
                        "avatar": self._fix_url(item.get("upic", "")),
                        "fans": item.get("fans", 0),
                        "description": item.get("usign", ""),
                    })

                return {"isEnd": True, "data": artists}
        except Exception as e:
            print(f"Bilibili artist search error: {e}")
            return {"isEnd": True, "data": []}

    async def get_video_pages(self, bvid: str) -> List[Dict[str, Any]]:
        """获取视频分P信息"""
        try:
            params = {"bvid": bvid}
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{self.BASE_URL}/x/web-interface/view",
                    params=params,
                    headers=self.headers,
                    timeout=5.0,
                )
                data = resp.json()

                if data["code"] != 0:
                    return []

                pages = data["data"].get("pages", [])
                return [
                    {
                        "cid": page["cid"],
                        "title": page.get("part", ""),
                        "duration": page.get("duration", 0),
                    }
                    for page in pages
                ]
        except Exception as e:
            print(f"Get video pages error: {e}")
            return []

    async def get_media_source(
        self,
        media_item: Dict[str, Any],
        quality: str = "standard",
    ) -> Optional[Dict[str, Any]]:
        """
        使用 Bilibili API 获取音频流
        
        参数:
            media_item: 歌曲信息
            quality: 音质 (low/standard/high/super)
        """
        try:
            bvid = media_item.get("bvid", "")
            aid = media_item.get("aid", 0)
            cid = media_item.get("cid", 0)

            # 如果没有 cid，先获取
            if not cid:
                cid = await self._get_cid(bvid, aid)
                if not cid:
                    print(f"Bilibili: cannot get cid for {bvid}")
                    return None

            # 构建请求参数
            base_params = {}
            if bvid:
                base_params["bvid"] = bvid
            else:
                base_params["aid"] = aid

            # 策略1: 尝试普通格式（合并流）- 优先使用，兼容性更好
            result = await self._try_normal(base_params, cid, bvid)
            if result:
                return result

            # 策略2: 尝试 DASH 格式（分离音频流）- 备选方案
            result = await self._try_dash(base_params, cid, quality, bvid)
            if result:
                return result

            print(f"Bilibili: no playable stream found for {bvid}")
            return None
        except Exception as e:
            print(f"Bilibili get_media_source error: {e}")
            return None

    async def _try_dash(self, base_params: dict, cid: int, quality: str, bvid: str) -> Optional[Dict[str, Any]]:
        """尝试 DASH 格式（分离音频流）"""
        try:
            params = {**base_params, "cid": cid, "fnval": 16}

            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{self.BASE_URL}/x/player/playurl",
                    params=params,
                    headers=self.headers,
                    timeout=10.0,
                )
                data = resp.json()

                if data["code"] != 0:
                    return None

                result_data = data.get("data", {})

                # 从 DASH 中提取音频
                if result_data.get("dash"):
                    audios = result_data["dash"].get("audio", [])
                    if not audios:
                        return None

                    # 按带宽排序
                    audios.sort(key=lambda x: x.get("bandwidth", 0))

                    # 根据音质选择
                    quality_map = {"low": 0, "standard": 1, "high": 2, "super": 3}
                    idx = min(quality_map.get(quality, 1), len(audios) - 1)

                    audio_url = audios[idx].get("baseUrl") or audios[idx].get("base_url", "")
                    if audio_url:
                        # 返回代理 URL，由后端处理 Referer 头
                        proxy_url = f"/api/online/proxy-audio?url={quote(audio_url)}&bvid={bvid}"
                        return {
                            "url": proxy_url,
                            "headers": None,  # 代理已处理 headers
                        }

            return None
        except Exception as e:
            print(f"Bilibili DASH error: {e}")
            return None

    async def _try_normal(self, base_params: dict, cid: int, bvid: str) -> Optional[Dict[str, Any]]:
        """尝试普通格式（合并流）"""
        try:
            params = {**base_params, "cid": cid, "fnval": 0}

            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{self.BASE_URL}/x/player/playurl",
                    params=params,
                    headers=self.headers,
                    timeout=10.0,
                )
                data = resp.json()

                if data["code"] != 0:
                    return None

                result_data = data.get("data", {})

                # 非 DASH 格式
                if result_data.get("durl"):
                    audio_url = result_data["durl"][0]["url"]
                    # 返回代理 URL，由后端处理 Referer 头
                    proxy_url = f"/api/online/proxy-audio?url={quote(audio_url)}&bvid={bvid}"
                    return {
                        "url": proxy_url,
                        "headers": None,  # 代理已处理 headers
                    }

            return None
        except Exception as e:
            print(f"Bilibili normal format error: {e}")
            return None

    async def get_lyric(
        self,
        media_item: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Bilibili 没有歌词"""
        return None

    async def get_album_info(
        self,
        album_item: Dict[str, Any],
        page: int = 1,
    ) -> Optional[Dict[str, Any]]:
        """获取专辑详情（展开分P）"""
        try:
            bvid = album_item.get("bvid", "")
            aid = album_item.get("aid", 0)

            if not bvid and not aid:
                return None

            params = {"bvid": bvid} if bvid else {"aid": aid}
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"{self.BASE_URL}/x/web-interface/view",
                    params=params,
                    headers=self.headers,
                    timeout=10.0,
                )
                data = resp.json()

                if data["code"] != 0:
                    return None

                video_data = data["data"]
                pages = video_data.get("pages", [])

                if len(pages) <= 1:
                    return {
                        "isEnd": True,
                        "musicList": [{
                            **album_item,
                            "cid": pages[0]["cid"] if pages else 0,
                        }],
                    }

                music_list = []
                for p in pages:
                    music_list.append({
                        **album_item,
                        "cid": p["cid"],
                        "title": p.get("part", ""),
                        "duration": p.get("duration", 0),
                        "id": f"{bvid}_p{p.get('page', 0)}",
                    })

                return {
                    "isEnd": True,
                    "musicList": music_list,
                }
        except Exception as e:
            print(f"Bilibili get_album_info error: {e}")
            return None

    async def get_top_lists(self) -> Optional[List[Dict[str, Any]]]:
        """获取榜单列表"""
        try:
            weekly = {"title": "每周必看", "data": []}

            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "https://api.bilibili.com/x/web-interface/popular/series/list",
                    headers=self.headers,
                    timeout=10.0,
                )
                data = resp.json()

                if data["code"] == 0:
                    weekly["data"] = [
                        {
                            "platform": self.platform,
                            "id": f"popular/series/one?number={e['number']}",
                            "title": e["subject"],
                            "description": e.get("name", ""),
                            "artwork": "https://s1.hdslb.com/bfs/static/jinkela/popular/assets/icon_weekly.png",
                        }
                        for e in data["data"]["list"][:8]
                    ]

            board_keys = [
                {"id": "ranking/v2?rid=0&type=all", "title": "全站"},
                {"id": "ranking/v2?rid=3&type=all", "title": "音乐"},
                {"id": "ranking/v2?rid=1&type=all", "title": "动画"},
                {"id": "ranking/v2?rid=119&type=all", "title": "鬼畜"},
                {"id": "ranking/v2?rid=129&type=all", "title": "舞蹈"},
                {"id": "ranking/v2?rid=4&type=all", "title": "游戏"},
                {"id": "ranking/v2?rid=36&type=all", "title": "知识"},
                {"id": "ranking/v2?rid=188&type=all", "title": "科技"},
                {"id": "ranking/v2?rid=0&type=origin", "title": "原创"},
                {"id": "ranking/v2?rid=0&type=rookie", "title": "新人"},
            ]

            board = {
                "title": "排行榜",
                "data": [
                    {
                        "platform": self.platform,
                        **item,
                        "artwork": "https://s1.hdslb.com/bfs/static/jinkela/popular/assets/icon_rank.png",
                    }
                    for item in board_keys
                ],
            }

            return [weekly, board]
        except Exception as e:
            print(f"Bilibili get_top_lists error: {e}")
            return None

    async def get_top_list_detail(
        self,
        top_item: Dict[str, Any],
        page: int = 1,
    ) -> Optional[Dict[str, Any]]:
        """获取榜单详情"""
        try:
            item_id = top_item.get("id", "")
            if not item_id:
                return None

            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"https://api.bilibili.com/x/web-interface/{item_id}",
                    headers={**self.headers, "referer": "https://www.bilibili.com/"},
                    timeout=10.0,
                )
                data = resp.json()

                if data["code"] != 0:
                    return None

                music_list = []
                for item in data.get("data", {}).get("list", []):
                    bvid = item.get("bvid", "")
                    music_list.append({
                        "platform": self.platform,
                        "id": bvid,
                        "title": self._clean_html(item.get("title", "")),
                        "artist": item.get("owner", {}).get("name", ""),
                        "artwork": self._fix_url(item.get("pic", "")),
                        "duration": item.get("duration", 0),
                        "bvid": bvid,
                        "aid": item.get("aid", 0),
                        "cid": 0,  # 需要后续获取
                    })

                return {
                    "isEnd": True,
                    "musicList": music_list,
                }
        except Exception as e:
            print(f"Bilibili get_top_list_detail error: {e}")
            return None


# 创建全局实例
bilibili_plugin = BilibiliPlugin()
