from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    PROJECT_NAME: str = "Asset Management System"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = "changeme"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    DATABASE_URL: str = "postgresql+asyncpg://asset_user:password@localhost:5432/asset_management"
    REDIS_URL: str = "redis://localhost:6379/0"
    # Đọc từ env var CORS_ORIGINS — "*" hoặc danh sách phân cách bởi dấu phẩy
    CORS_ORIGINS: str = "http://localhost:3001,http://localhost:5174"
    ENVIRONMENT: str = "development"

    @property
    def backend_cors_origins(self) -> List[str]:
        v = self.CORS_ORIGINS.strip()
        if v == "*":
            return ["*"]
        return [o.strip() for o in v.split(",") if o.strip()]

    class Config:
        env_file = ".env"


settings = Settings()
