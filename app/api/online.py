"""在线音乐 API"""

from fastapi import APIRouter, HTTPException, Query, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from urllib.parse import urlparse, unquote
import httpx

from app.db import get_db
from app.plugins.manager import plugin_manager
from app.services.downloader import download_service

router = APIRouter()

BILIBILI_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
)


class StreamRequest(BaseModel):
    source: str
    track: Dict[str, Any]
    quality: str = "standard"


class DownloadRequest(BaseModel):
    source: str
    track: Dict[str, Any]
    quality: str = "standard"


class SearchResult(BaseModel):
    isEnd: bool
    data: List[Dict[str, Any]]


class StreamResponse(BaseModel):
    url: str
    headers: Optional[Dict[str, str]] = None


@router.get("/search")
async def search_music(
    q: str = Query(..., min_length=1, description="搜索关键词"),
    source: str = Query("kugou", description="音乐源: kugou, bilibili"),
    page: int = Query(1, ge=1, description="页码"),
    type: str = Query("music", description="搜索类型: music, album, artist, sheet"),
):
    """搜索在线音乐"""
    try:
        result = await plugin_manager.search(source, q, page, type)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Search error: {e}")
        raise HTTPException(status_code=500, detail="搜索失败")


@router.post("/stream")
async def get_stream_url(request: StreamRequest):
    """获取音频流 URL"""
    try:
        result = await plugin_manager.get_media_source(
            request.source,
            request.track,
            request.quality,
        )
        if not result:
            raise HTTPException(status_code=404, detail="无法获取音频流")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        print(f"Stream error: {e}")
        raise HTTPException(status_code=500, detail="获取音频流失败")


@router.get("/lyric")
async def get_lyric(
    source: str = Query(..., description="音乐源"),
    id: str = Query(..., description="歌曲ID"),
):
    """获取歌词"""
    try:
        media_item = {"id": id, "platform": source}
        result = await plugin_manager.get_lyric(source, media_item)
        if not result:
            return {"rawLrc": ""}
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Lyric error: {e}")
        raise HTTPException(status_code=500, detail="获取歌词失败")


@router.get("/sources")
async def get_sources():
    """获取可用音乐源列表"""
    return {"sources": plugin_manager.get_plugins_info()}


@router.get("/search-types")
async def get_search_types(source: str = Query("kugou")):
    """获取指定源支持的搜索类型"""
    types = plugin_manager.get_supported_search_types(source)
    return {"source": source, "types": types}


@router.get("/album/{source}/{album_id}")
async def get_album_info(
    source: str,
    album_id: str,
    page: int = Query(1, ge=1),
):
    """获取专辑详情"""
    try:
        album_item = {"id": album_id, "platform": source}
        result = await plugin_manager.get_album_info(source, album_item, page)
        if not result:
            raise HTTPException(status_code=404, detail="专辑不存在")
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"Album error: {e}")
        raise HTTPException(status_code=500, detail="获取专辑信息失败")


@router.get("/toplists/{source}")
async def get_top_lists(source: str):
    """获取榜单列表"""
    try:
        result = await plugin_manager.get_top_lists(source)
        if not result:
            return []
        return result
    except Exception as e:
        print(f"Top lists error: {e}")
        raise HTTPException(status_code=500, detail="获取榜单列表失败")


@router.get("/toplists/{source}/{top_id}")
async def get_top_list_detail(
    source: str,
    top_id: str,
    page: int = Query(1, ge=1),
):
    """获取榜单详情"""
    try:
        top_item = {"id": top_id, "platform": source}
        result = await plugin_manager.get_top_list_detail(source, top_item, page)
        if not result:
            raise HTTPException(status_code=404, detail="榜单不存在")
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"Top list detail error: {e}")
        raise HTTPException(status_code=500, detail="获取榜单详情失败")


@router.post("/download")
async def download_music(
    request: DownloadRequest,
    db: AsyncSession = Depends(get_db),
):
    """下载音乐"""
    try:
        # 获取音频流
        stream_result = await plugin_manager.get_media_source(
            request.source,
            request.track,
            request.quality,
        )
        if not stream_result:
            raise HTTPException(status_code=404, detail="无法获取音频流")

        # 下载文件
        title = request.track.get("title", "未知歌曲")
        artist = request.track.get("artist")
        album = request.track.get("album")
        headers = stream_result.get("headers")

        download = await download_service.download(
            db=db,
            url=stream_result["url"],
            title=title,
            artist=artist,
            album=album,
            headers=headers,
            track_info=request.track,
        )

        return {
            "id": download.id,
            "title": download.title,
            "artist": download.artist,
            "status": download.status,
            "file_path": download.file_path,
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Download error: {e}")
        raise HTTPException(status_code=500, detail="下载失败")


@router.get("/proxy-audio")
async def proxy_audio(
    request: Request,
    url: str = Query(..., description="音频 URL"),
    bvid: str = Query("", description="Bilibili BV 号"),
):
    """
    代理 Bilibili 音频流
    
    解决浏览器 <audio> 元素无法设置自定义 Referer 头的问题
    支持 Range 请求（用于 seek）
    """
    # 验证 URL 是否为 Bilibili CDN
    try:
        parsed = urlparse(url)
        if not parsed.hostname or not parsed.hostname.endswith('.bilivideo.com'):
            raise HTTPException(status_code=400, detail="无效的音频 URL")
    except Exception:
        raise HTTPException(status_code=400, detail="无效的音频 URL")
    
    # 构建代理请求头
    referer = f"https://www.bilibili.com/video/{bvid}" if bvid else "https://www.bilibili.com/"
    proxy_headers = {
        "User-Agent": BILIBILI_UA,
        "Referer": referer,
        "Origin": "https://www.bilibili.com",
    }
    
    # 转发 Range 头
    range_header = request.headers.get("range")
    if range_header:
        proxy_headers["Range"] = range_header
    
    try:
        client = httpx.AsyncClient(timeout=30.0)
        
        # 发起流式请求
        req = client.build_request("GET", url, headers=proxy_headers)
        resp = await client.send(req, stream=True)
        
        # 检查响应状态
        if resp.status_code not in (200, 206):
            await resp.aclose()
            await client.aclose()
            raise HTTPException(status_code=resp.status_code, detail="上游服务器返回错误")
        
        # 构建响应头
        response_headers = {
            "Content-Type": resp.headers.get("Content-Type", "audio/mp4"),
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*",
        }
        
        # 转发 Content-Range（用于 seek 响应）
        if "Content-Range" in resp.headers:
            response_headers["Content-Range"] = resp.headers["Content-Range"]
        
        # 转发 Content-Length
        if "Content-Length" in resp.headers:
            response_headers["Content-Length"] = resp.headers["Content-Length"]
        
        # 流式返回
        async def stream_generator():
            try:
                async for chunk in resp.aiter_bytes(chunk_size=8192):
                    yield chunk
            finally:
                await resp.aclose()
                await client.aclose()
        
        return StreamingResponse(
            stream_generator(),
            status_code=resp.status_code,
            headers=response_headers,
        )
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"代理请求失败: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Proxy error: {e}")
        raise HTTPException(status_code=500, detail="代理请求失败")


@router.get("/proxy-image")
async def proxy_image(
    url: str = Query(..., description="图片 URL"),
):
    """
    代理图片请求
    
    支持 Bilibili CDN (hdslb.com) 和网易云 CDN (music.126.net)
    解决浏览器 <img> 元素无法设置自定义 Referer 头的问题
    支持缓存（24小时）
    """
    # 允许的域名列表
    ALLOWED_DOMAINS = ['hdslb.com', 'music.126.net', 'p1.music.126.net']
    
    # 验证 URL 域名
    try:
        parsed = urlparse(url)
        if not parsed.hostname:
            raise HTTPException(status_code=400, detail="无效的图片 URL")
        
        is_allowed = any(parsed.hostname.endswith(domain) for domain in ALLOWED_DOMAINS)
        if not is_allowed:
            raise HTTPException(status_code=400, detail="无效的图片 URL")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="无效的图片 URL")
    
    # 根据域名设置不同的 Referer
    proxy_headers = {
        "User-Agent": BILIBILI_UA,
    }
    
    if 'hdslb.com' in url:
        proxy_headers["Referer"] = "https://www.bilibili.com/"
    elif 'music.126.net' in url:
        proxy_headers["Referer"] = "https://music.163.com/"
    else:
        proxy_headers["Referer"] = "https://www.bilibili.com/"
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers=proxy_headers)
            
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail="获取图片失败")
            
            # 构建响应头，添加缓存
            response_headers = {
                "Content-Type": resp.headers.get("Content-Type", "image/jpeg"),
                "Cache-Control": "public, max-age=86400",  # 缓存24小时
                "Access-Control-Allow-Origin": "*",
            }
            
            if "Content-Length" in resp.headers:
                response_headers["Content-Length"] = resp.headers["Content-Length"]
            
            return StreamingResponse(
                iter([resp.content]),
                status_code=200,
                headers=response_headers,
            )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Image proxy error: {e}")
        raise HTTPException(status_code=500, detail="获取图片失败")
