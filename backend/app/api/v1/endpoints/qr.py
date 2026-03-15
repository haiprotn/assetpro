from fastapi import APIRouter, Depends, HTTPException
from app.db.session import get_db
from app.core.auth import get_current_user

router = APIRouter()

@router.get("/asset/{asset_id}/image")
async def qr_image(asset_id: str, db=Depends(get_db)):
    """Generate printable QR label image for an asset"""
    import uuid
    from app.services.asset_service import AssetService
    return await AssetService.generate_qr_image(db, uuid.UUID(asset_id))

@router.get("/lookup/{token}")
async def qr_lookup(token: str, db=Depends(get_db)):
    """Public: resolve QR token to transfer order summary"""
    from app.services.transfer_service import TransferService
    order = await TransferService.get_by_qr_token(db, token)
    if not order:
        raise HTTPException(status_code=404, detail="Invalid QR token")
    return {
        "order_code": order.order_code,
        "order_type": order.order_type,
        "status": order.status,
    }
