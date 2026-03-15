"""
API Router - v1
Asset Management System - Complete Endpoint Map
"""
from fastapi import APIRouter

from app.api.v1.endpoints import (
    assets,
    asset_types,
    transfers,
    lifecycle,
    maintenance,
    locations,
    departments,
    personnel,
    suppliers,
    dashboard,
    auth,
    qr,
    import_assets,
    users,
)

api_router = APIRouter()

# Auth & Users
api_router.include_router(auth.router,  prefix="/auth",  tags=["🔐 Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["👥 Users & Permissions"])

# Core Resources
api_router.include_router(assets.router, prefix="/assets", tags=["📦 Assets"])
api_router.include_router(asset_types.router, prefix="/asset-types", tags=["🗂️ Asset Types & Attributes"])
api_router.include_router(transfers.router, prefix="/transfers", tags=["🔄 Transfers & Allocation"])
api_router.include_router(lifecycle.router, prefix="/lifecycle", tags=["📜 Lifecycle & Audit Trail"])
api_router.include_router(maintenance.router, prefix="/maintenance", tags=["🔧 Maintenance"])

# Supporting Resources
api_router.include_router(locations.router, prefix="/locations", tags=["📍 Locations & Sites"])
api_router.include_router(departments.router, prefix="/departments", tags=["🏢 Departments"])
api_router.include_router(personnel.router, prefix="/personnel", tags=["👤 Personnel"])
api_router.include_router(suppliers.router, prefix="/suppliers", tags=["🏭 Suppliers"])

# Special
api_router.include_router(qr.router, prefix="/qr", tags=["📱 QR Code"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["📊 Dashboard & Analytics"])
api_router.include_router(import_assets.router, prefix="/data", tags=["📥 Import / Export"])
