"""
Transfer Orders API - Complex allocation flow with QR cross-verification
"""
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.assets import (
    TransferOrderCreate, TransferOrderOut, QRVerificationRequest
)
from app.services.transfer_service import TransferService
from app.core.auth import get_current_user

router = APIRouter()


# ============================================================
# TRANSFER ORDER CRUD
# ============================================================

@router.get("")
async def list_transfer_orders(
    order_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    location_id: Optional[uuid.UUID] = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await TransferService.list_orders(
        db, order_type=order_type, status=status,
        location_id=location_id, page=page, size=size
    )


@router.post("", response_model=TransferOrderOut, status_code=201)
async def create_transfer_order(
    data: TransferOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Create a transfer/allocation order.
    
    Flow:
    1. DRAFT → user builds order
    2. PENDING_APPROVAL → submitted for manager sign-off
    3. APPROVED → ready to execute
    4. IN_TRANSIT → assets physically moving
    5. PENDING_QR_CONFIRM → destination must scan QR to confirm receipt
    6. COMPLETED → verified and complete
    
    QR verification token is auto-generated and included in response.
    """
    return await TransferService.create_order(db, data, created_by=current_user.id)


@router.get("/{order_id}", response_model=TransferOrderOut)
async def get_transfer_order(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    order = await TransferService.get_by_id(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Transfer order not found")
    return order


# ============================================================
# WORKFLOW STATE TRANSITIONS
# ============================================================

@router.post("/{order_id}/submit")
async def submit_for_approval(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Submit draft order for manager approval"""
    return await TransferService.transition(db, order_id, "submit", by=current_user.id)


@router.post("/{order_id}/approve")
async def approve_order(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Manager approves the transfer order"""
    return await TransferService.transition(db, order_id, "approve", by=current_user.id)


@router.post("/{order_id}/reject")
async def reject_order(
    order_id: uuid.UUID,
    reason: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Manager rejects with reason"""
    return await TransferService.transition(
        db, order_id, "reject", by=current_user.id, reason=reason
    )


@router.post("/{order_id}/dispatch")
async def dispatch_assets(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Mark assets as IN_TRANSIT. Updates asset statuses.
    Generates QR verification token for destination to confirm.
    Returns: { qr_token, qr_image_url, order }
    """
    return await TransferService.dispatch(db, order_id, by=current_user.id)


# ============================================================
# QR CROSS-VERIFICATION (Core feature)
# ============================================================

@router.post("/{order_id}/verify-qr")
async def verify_qr_receipt(
    order_id: uuid.UUID,
    data: QRVerificationRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Destination site scans QR code to confirm receipt of assets.
    
    This is the cross-verification step that:
    1. Validates the QR token matches the transfer order
    2. Records GPS coordinates of scan location
    3. Marks transfer as COMPLETED
    4. Updates all asset statuses and locations
    5. Writes LIFECYCLE events for each asset
    6. Calculates and logs any discrepancies
    
    Returns: { success, verified_items, discrepancies, completed_at }
    """
    return await TransferService.verify_qr(db, order_id, data)


@router.get("/qr-lookup/{token}")
async def lookup_by_qr_token(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Public endpoint: scan QR → get transfer order details.
    Used by mobile app before authentication to preview what's being confirmed.
    """
    order = await TransferService.get_by_qr_token(db, token)
    if not order:
        raise HTTPException(status_code=404, detail="Invalid QR token")
    return {
        "order_code": order.order_code,
        "order_type": order.order_type,
        "from_location": order.from_location_name,
        "to_location": order.to_location_name,
        "item_count": order.item_count,
        "status": order.status,
    }


@router.get("/{order_id}/items")
async def get_order_items(
    order_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List all assets in this transfer order with their QR scan status"""
    return await TransferService.get_order_items(db, order_id)


@router.post("/{order_id}/cancel")
async def cancel_order(
    order_id: uuid.UUID,
    reason: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return await TransferService.transition(
        db, order_id, "cancel", by=current_user.id, reason=reason
    )
