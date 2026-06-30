from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from pathlib import Path

from app.config import settings

# 确保数据目录存在
db_path = Path(settings.DB_PATH)
db_path.parent.mkdir(parents=True, exist_ok=True)

# 创建异步引擎
engine = create_async_engine(
    f"sqlite+aiosqlite:///{db_path}",
    echo=False,
    future=True,
)

# 创建异步会话工厂
async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    """获取数据库会话的依赖注入"""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db():
    """初始化数据库表"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
