from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # 项目根目录
    BASE_DIR: str = str(Path(__file__).parent.parent)
    
    # 音乐目录
    MUSIC_ROOT: str = ""
    
    # 服务器配置
    HOST: str = ""
    PORT: int = 38000
    
    # 数据库
    DB_PATH: str = ""
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()


def get_music_root() -> Path:
    """获取音乐根目录 Path 对象"""
    return Path(settings.MUSIC_ROOT)



