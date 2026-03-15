"""
Transfer Service - Complex allocation flow with QR cross-verification
"""
import uuid
import secrets
from datetime import datetime
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from fastapi import HTTPException

from app.models.assets import Asset, TransferOrder, TransferOrderItem, AssetLifecycleEvent
from app.schemas.assets import TransferOrderCreate, QRVerificationRequest

_ENRICH_SQL = """
    SELECT t.*,
           fl.name     AS from_location_name,
           tl.name     AS to_location_name,
           p.full_name AS assigned_personnel_name,
           (SELECT COUNT(*) FROM transfer_order_items ti
            WHERE ti.transfer_order_id = t.id) AS item_count
    FROM transfer_orders t
    LEFT JOIN locations fl ON fl.id = t.from_location_id
    LEFT JOIN locations tl ON tl.id = t.to_location_id
    LEFT JOIN personnel p  ON p.id  = t.assigned_personnel_id
    WHERE t.id = :id
"""

# Valid state machine transitions
TRANSITIONS = {
    "approve":  {"from": ["DRAFT", "PENDING_APPROVAL"], "to": "APPROVED"},
    "reject":   {"from": ["DRAFT", "PENDING_APPROVAL"], "to": "REJECTED"},
    "dispatch": {"from": ["APPROVED"],                  "to": "IN_TRANSIT"},
    "cancel":   {"from": ["DRAFT", "PENDING_APPROVAL", "APPROVED"], "to": "CANCELLED"},
}


class TransferService:

    @staticmethod
    async def _get_enriched(db: AsyncSession, order_id: uuid.UUID):
        """Return one transfer order as a dict with all joined fields."""
        row = (await db.execute(text(_ENRICH_SQL), {"id": str(order_id)})).mappings().first()
        return dict(row) if row else None

    @staticmethod
    async def create_order(
        db: AsyncSession, data: TransferOrderCreate, created_by: uuid.UUID
    ) -> TransferOrder:
        # Validate all asset_ids exist
        for item in data.items:
            result = await db.execute(select(Asset).where(Asset.id == item.asset_id))
            asset = result.scalar_one_or_none()
            if not asset:
                raise HTTPException(status_code=404, detail=f"Asset {item.asset_id} not found")

        # Generate order code
        count_result = await db.execute(select(TransferOrder))
        count = len(count_result.scalars().all())
        order_code = f"DC-{datetime.now().year}-{str(count + 1).zfill(4)}"

        # Generate QR verification token
        qr_token = f"TRANSFER-{secrets.token_urlsafe(16).upper()}"

        order = TransferOrder(
            id=uuid.uuid4(),
            order_code=order_code,
            qr_verification_token=qr_token,
            requested_by=created_by,
            status="DRAFT",
            **data.model_dump(exclude={"items"})
        )
        db.add(order)
        await db.flush()

        # Create line items
        for item_data in data.items:
            item = TransferOrderItem(
                id=uuid.uuid4(),
                transfer_order_id=order.id,
                **item_data.model_dump()
            )
            db.add(item)

        await db.commit()
        return await TransferService._get_enriched(db, order.id)

    @staticmethod
    async def transition(
        db: AsyncSession,
        order_id: uuid.UUID,
        action: str,
        by: uuid.UUID,
        reason: Optional[str] = None,
    ) -> TransferOrder:
        result = await db.execute(select(TransferOrder).where(TransferOrder.id == order_id))
        order = result.scalar_one_or_none()

        if not order:
            raise HTTPException(status_code=404, detail="Transfer order not found")

        transition = TRANSITIONS.get(action)
        if not transition:
            raise HTTPException(status_code=400, detail=f"Unknown action: {action}")

        if order.status not in transition["from"]:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot '{action}' order in status '{order.status}'. Expected: {transition['from']}"
            )

        order.status = transition["to"]

        if action == "approve":
            order.approved_by = by
            order.approved_at = datetime.utcnow()
        elif action == "reject":
            order.rejection_reason = reason

        await db.commit()
        await db.refresh(order)
        return order

    @staticmethod
    async def dispatch(db: AsyncSession, order_id: uuid.UUID, by: uuid.UUID):
        """Dispatch: mark IN_TRANSIT, update asset statuses"""
        result = await db.execute(select(TransferOrder).where(TransferOrder.id == order_id))
        order = result.scalar_one_or_none()

        if not order or order.status != "APPROVED":
            raise HTTPException(status_code=409, detail="Order must be APPROVED before dispatch")

        # Get order items
        items_result = await db.execute(
            select(TransferOrderItem).where(TransferOrderItem.transfer_order_id == order_id)
        )
        items = items_result.scalars().all()

        # Update each asset
        for item in items:
            asset_result = await db.execute(select(Asset).where(Asset.id == item.asset_id))
            asset = asset_result.scalar_one_or_none()
            if asset:
                item.condition_before = asset.status
                # Log lifecycle event
                event = AssetLifecycleEvent(
                    id=uuid.uuid4(),
                    asset_id=asset.id,
                    event_type="TRANSFERRED",
                    transfer_order_id=order_id,
                    performed_by=by,
                    from_location_id=asset.current_location_id,
                    to_location_id=order.to_location_id,
                    previous_state={"status": asset.status, "location": str(asset.current_location_id)},
                    new_state={"status": "IN_TRANSIT"},
                    event_description=f"Dispatched via order {order.order_code}",
                )
                db.add(event)

        order.status = "IN_TRANSIT"
        await db.commit()
        await db.refresh(order)

        return {
            "order": order,
            "qr_token": order.qr_verification_token,
            "message": "Assets dispatched. Destination must scan QR to confirm receipt.",
        }

    @staticmethod
    async def verify_qr(
        db: AsyncSession, order_id: uuid.UUID, data: QRVerificationRequest
    ):
        """
        QR Cross-Verification - the core integrity check.
        Destination scans QR → confirms receipt → completes transfer.
        """
        result = await db.execute(select(TransferOrder).where(TransferOrder.id == order_id))
        order = result.scalar_one_or_none()

        if not order:
            raise HTTPException(status_code=404, detail="Transfer order not found")

        if order.status != "IN_TRANSIT":
            raise HTTPException(status_code=409, detail="Order is not in transit")

        # Validate QR token
        if order.qr_verification_token != data.qr_verification_token:
            # Log failed verification attempt
            event = AssetLifecycleEvent(
                id=uuid.uuid4(),
                asset_id=None,
                event_type="QR_SCANNED",
                transfer_order_id=order_id,
                performed_by=data.confirmed_by_user_id,
                event_description="FAILED QR verification attempt",
                gps_coordinates=data.gps_coordinates,
            )
            db.add(event)
            await db.commit()
            raise HTTPException(status_code=400, detail="Invalid QR code. Verification failed.")

        # Get items and update assets
        items_result = await db.execute(
            select(TransferOrderItem).where(TransferOrderItem.transfer_order_id == order_id)
        )
        items = items_result.scalars().all()
        verified_items = []

        for item in items:
            asset_result = await db.execute(select(Asset).where(Asset.id == item.asset_id))
            asset = asset_result.scalar_one_or_none()

            if asset:
                old_location = asset.current_location_id
                old_dept = asset.managing_department_id

                # Update asset state
                asset.current_location_id = order.to_location_id
                asset.managing_department_id = order.to_department_id

                if order.order_type == "ALLOCATION":
                    asset.status = "IN_USE"
                    asset.qty_allocated = (asset.qty_allocated or 0) + item.quantity
                elif order.order_type == "RECOVERY":
                    asset.status = "PENDING_ALLOCATION"
                    asset.qty_recovered = (asset.qty_recovered or 0) + item.quantity
                elif order.order_type == "MAINTENANCE_OUT":
                    asset.status = "IN_MAINTENANCE"
                    asset.qty_maintenance = (asset.qty_maintenance or 0) + item.quantity
                elif order.order_type == "LIQUIDATION":
                    asset.status = "LIQUIDATED"
                    asset.qty_liquidated = (asset.qty_liquidated or 0) + item.quantity

                # Personnel assignment
                if order.assigned_personnel_id:
                    asset.assigned_personnel_id = order.assigned_personnel_id

                # Mark item confirmed
                item.item_qr_confirmed = True
                item.item_qr_confirmed_at = datetime.utcnow()

                # Log lifecycle event
                event = AssetLifecycleEvent(
                    id=uuid.uuid4(),
                    asset_id=asset.id,
                    event_type="QR_SCANNED",
                    transfer_order_id=order_id,
                    performed_by=data.confirmed_by_user_id,
                    from_location_id=old_location,
                    to_location_id=order.to_location_id,
                    previous_state={"location": str(old_location), "status": item.condition_before},
                    new_state={"location": str(order.to_location_id), "status": asset.status},
                    event_description=f"QR verified receipt at destination - order {order.order_code}",
                    gps_coordinates=data.gps_coordinates,
                )
                db.add(event)
                verified_items.append({"asset_code": asset.asset_code, "name": asset.name})

        # Complete the order
        order.status = "COMPLETED"
        order.qr_verified_at = datetime.utcnow()
        order.qr_verified_by = data.confirmed_by_user_id
        order.qr_verification_location = data.gps_coordinates
        order.completed_at = datetime.utcnow()

        await db.commit()

        return {
            "success": True,
            "order_code": order.order_code,
            "verified_items": verified_items,
            "completed_at": order.completed_at.isoformat(),
            "gps_verified_at": data.gps_coordinates,
        }

    @staticmethod
    async def get_by_id(db: AsyncSession, order_id: uuid.UUID):
        return await TransferService._get_enriched(db, order_id)

    @staticmethod
    async def get_by_qr_token(db: AsyncSession, token: str) -> Optional[TransferOrder]:
        result = await db.execute(
            select(TransferOrder).where(TransferOrder.qr_verification_token == token)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list_orders(db, order_type=None, status=None, location_id=None, page=1, size=20):
        where_clauses = ["1=1"]
        params = {"limit": size, "offset": (page - 1) * size}
        if order_type:
            where_clauses.append("t.order_type = :order_type")
            params["order_type"] = order_type
        if status:
            where_clauses.append("t.status = :status")
            params["status"] = status

        sql = f"""
            SELECT t.*,
                   fl.name     AS from_location_name,
                   tl.name     AS to_location_name,
                   p.full_name AS assigned_personnel_name,
                   (SELECT COUNT(*) FROM transfer_order_items ti
                    WHERE ti.transfer_order_id = t.id) AS item_count
            FROM transfer_orders t
            LEFT JOIN locations fl ON fl.id = t.from_location_id
            LEFT JOIN locations tl ON tl.id = t.to_location_id
            LEFT JOIN personnel p  ON p.id  = t.assigned_personnel_id
            WHERE {' AND '.join(where_clauses)}
            ORDER BY t.created_at DESC
            LIMIT :limit OFFSET :offset
        """
        rows = (await db.execute(text(sql), params)).mappings().all()
        return [dict(r) for r in rows]

    @staticmethod
    async def get_order_items(db: AsyncSession, order_id: uuid.UUID):
        sql = text("""
            SELECT ti.*,
                   a.asset_code,
                   a.name        AS asset_name,
                   ti.item_qr_confirmed AS qr_scanned
            FROM transfer_order_items ti
            LEFT JOIN assets a ON a.id = ti.asset_id
            WHERE ti.transfer_order_id = :order_id
            ORDER BY ti.created_at
        """)
        rows = (await db.execute(sql, {"order_id": str(order_id)})).mappings().all()
        return [dict(r) for r in rows]
