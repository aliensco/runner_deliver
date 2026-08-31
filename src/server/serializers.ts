import type { OrderRow } from "./orders";

export function orderDto(order: OrderRow) {
  return {
    id: order.id,
    orderNo: order.order_no,
    merchantId: order.merchant_id,
    merchantName: order.merchant_name,
    riderId: order.rider_id,
    riderName: order.rider_name,
    pricingRuleId: order.pricing_rule_id,
    pricingRuleName: order.pricing_rule_name,
    status: order.status,
    pickupAddress: order.pickup_address,
    deliveryAddress: order.delivery_address,
    recipientName: order.recipient_name,
    recipientPhone: order.recipient_phone,
    itemsDescription: order.items_description,
    distanceMeters: order.distance_meters,
    merchantChargeCents: order.merchant_charge_cents,
    riderPayoutCents: order.rider_payout_cents,
    cancellationReason: order.cancellation_reason,
    assignedAt: order.assigned_at,
    acceptedAt: order.accepted_at,
    pickedUpAt: order.picked_up_at,
    deliveredAt: order.delivered_at,
    cancelledAt: order.cancelled_at,
    merchantRefundedAt: order.merchant_refunded_at,
    riderPaidAt: order.rider_paid_at,
    createdAt: order.created_at,
    updatedAt: order.updated_at
  };
}

export function merchantDto(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    contactName: row.contact_name,
    phone: row.phone,
    address: row.address,
    balanceCents: row.balance_cents,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function riderDto(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    vehicleType: row.vehicle_type,
    status: row.status,
    balanceCents: row.balance_cents,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function pricingRuleDto(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    baseFeeCents: row.base_fee_cents,
    baseDistanceMeters: row.base_distance_meters,
    perKmCents: row.per_km_cents,
    minimumFeeCents: row.minimum_fee_cents,
    riderSharePercent: row.rider_share_percent,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function ledgerDto(row: Record<string, unknown>) {
  return {
    id: row.id,
    accountType: row.account_type,
    merchantId: row.merchant_id,
    riderId: row.rider_id,
    orderId: row.order_id,
    entryType: row.entry_type,
    amountCents: row.amount_cents,
    idempotencyKey: row.idempotency_key,
    description: row.description,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at
  };
}
