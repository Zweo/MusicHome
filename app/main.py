from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from app.config import settings
from app.db import init_db
from app.api import online, local, stream

app = FastAPI(
    title="MusicHome",
    description="音乐管理系统 - 在线音乐库 + 本地音乐库",
    version="1.0.0",
)

# CORS 配置 - 局域网访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(online.router, prefix="/api/online", tags=["在线音乐"])
app.include_router(local.router, prefix="/api/local", tags=["本地音乐"])
app.include_router(stream.router, prefix="/api/stream", tags=["音频流"])

# 静态文件
static_dir = Path(__file__).parent.parent / "static"
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.on_event("startup")
async def startup():
    """应用启动时初始化数据库"""
    await init_db()


@app.get("/")
async def root():
    """返回主页"""
    return FileResponse(static_dir / "index.html")


@app.get("/health")
async def health():
    """健康检查"""
    return {"status": "ok", "version": "1.0.0"}


@app.get("/favicon.ico")
async def favicon():
    """返回 favicon 图标"""
    return FileResponse(static_dir / "favicon.ico", media_type="image/x-icon")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
    )
