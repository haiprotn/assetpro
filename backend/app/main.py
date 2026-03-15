"""
Asset Management System - FastAPI Backend
"""
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.session import engine, Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print(f"🚀 Starting {settings.PROJECT_NAME}")
    yield
    # Shutdown
    print("👋 Shutting down")


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Multi-type Asset Management System API",
    version="1.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.backend_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Routes
app.include_router(api_router, prefix=settings.API_V1_STR)

# Serve uploaded asset images as static files
_upload_dir = os.environ.get("UPLOAD_DIR", "/app/uploads/assets")
os.makedirs(_upload_dir, exist_ok=True)
app.mount("/uploads/assets", StaticFiles(directory=_upload_dir), name="asset_images")

# Serve uploaded documents/chứng từ
_doc_dir = _upload_dir.replace("/assets", "/docs")
os.makedirs(_doc_dir, exist_ok=True)
app.mount("/uploads/docs", StaticFiles(directory=_doc_dir), name="asset_docs")


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}
