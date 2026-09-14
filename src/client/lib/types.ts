export type Role = "admin" | "merchant" | "rider";

export type OrderStatus =
  | "pending"
  | "assigned"
  | "accepted"
  | "picked_up"
  | "delivered"
  | "cancelled";

export type OrderActionStatus = "accepted" | "picked_up" | "delivered" | "cancelled";
export type RiderStatus = "available" | "busy" | "offline";
export type AccountType = "merchant" | "rider";
export type LedgerEntryType =
  | "opening_balance"
  | "admin_adjustment"
  | "order_charge"
  | "order_refund"
  | "delivery_payout";

export type OrderEventType =
  | "created"
  | "details_updated"
  | "assigned"
  | "reassigned"
  | "status_changed";

export type IsoDateString = string;

export interface User {
  id: number;
  username: string;
  role: Role;
  displayName: string;
  merchantId: number | null;
  riderId: number | null;
}

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
}

export interface Order {
  parcelDemo?: { campusName: string; parcelCount: number; pickupCode: string };
  id: number;
  orderNo: string;
  merchantId: number;
  merchantName: string;
  riderId: number | null;
  riderName: string | null;
  pricingRuleId: number;
  pricingRuleName: string;
  status: OrderStatus;
  pickupAddress: string;
  deliveryAddress: string;
  recipientName: string;
  recipientPhone: string;
  itemsDescription: string;
  distanceMeters: number;
  merchantChargeCents: number;
  riderPayoutCents: number;
  cancellationReason: string | null;
  assignedAt: IsoDateString | null;
  acceptedAt: IsoDateString | null;
  pickedUpAt: IsoDateString | null;
  deliveredAt: IsoDateString | null;
  cancelledAt: IsoDateString | null;
  merchantRefundedAt: IsoDateString | null;
  riderPaidAt: IsoDateString | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface OrderEvent {
  id: number;
  orderId: number;
  actorUserId: number | null;
  actorName: string | null;
  eventType: OrderEventType;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  metadata: Record<string, unknown>;
  createdAt: IsoDateString;
}

export interface Merchant {
  id: number;
  name: string;
  contactName: string;
  phone: string;
  address: string;
  balanceCents: number;
  active: boolean;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface Rider {
  id: number;
  name: string;
  phone: string;
  vehicleType: string;
  status: RiderStatus;
  balanceCents: number;
  active: boolean;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface PricingRule {
  id: number;
  name: string;
  baseFeeCents: number;
  baseDistanceMeters: number;
  perKmCents: number;
  minimumFeeCents: number;
  riderSharePercent: number;
  active: boolean;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
}

export interface LedgerEntry {
  id: number;
  accountType: AccountType;
  merchantId: number | null;
  riderId: number | null;
  orderId: number | null;
  entryType: LedgerEntryType;
  amountCents: number;
  idempotencyKey: string;
  description: string;
  createdByUserId: number | null;
  createdAt: IsoDateString;
}

export type OrderStatusCounts = Record<OrderStatus, number>;

export interface AdminDashboard {
  role: "admin";
  orderCounts: OrderStatusCounts;
  merchants: {
    activeCount: number;
    totalBalanceCents: number;
  };
  riders: {
    activeCount: number;
    totalBalanceCents: number;
  };
  financials: {
    orderChargesCents: number;
    deliveredOrderValueCents: number;
    riderPayoutsCents: number;
  };
}

export interface MerchantDashboard {
  role: "merchant";
  balanceCents: number;
  orderCounts: OrderStatusCounts;
  financials: {
    chargesCents: number;
    refundsCents: number;
  };
}

export interface RiderDashboard {
  role: "rider";
  riderStatus: RiderStatus;
  balanceCents: number;
  payoutTotalCents: number;
  orderCounts: OrderStatusCounts;
}

export type DashboardData = AdminDashboard | MerchantDashboard | RiderDashboard;
export type Dashboard = DashboardData;

export interface LoginInput {
  username: string;
  password: string;
}

export interface OrdersListParams {
  status?: OrderStatus;
  merchantId?: number;
  riderId?: number;
  limit?: number;
  offset?: number;
}

export interface CreateOrderInput {
  merchantId?: number;
  pricingRuleId?: number;
  pickupAddress: string;
  deliveryAddress: string;
  recipientName: string;
  recipientPhone: string;
  itemsDescription?: string;
  distanceMeters: number;
}

export interface UpdateOrderInput {
  pickupAddress?: string;
  deliveryAddress?: string;
  recipientName?: string;
  recipientPhone?: string;
  itemsDescription?: string;
}

export interface AssignOrderInput {
  riderId: number;
}

export interface ChangeOrderStatusInput {
  status: OrderActionStatus;
  cancellationReason?: string;
}

export interface CreateMerchantInput {
  name: string;
  contactName: string;
  phone: string;
  address?: string;
  openingBalanceCents?: number;
}

export interface UpdateMerchantInput {
  name?: string;
  contactName?: string;
  phone?: string;
  address?: string;
  active?: boolean;
}

export interface CreateRiderInput {
  name: string;
  phone: string;
  vehicleType?: string;
}

export interface UpdateRiderInput {
  name?: string;
  phone?: string;
  vehicleType?: string;
  status?: RiderStatus;
  active?: boolean;
}

export interface CreatePricingRuleInput {
  name: string;
  baseFeeCents: number;
  baseDistanceMeters: number;
  perKmCents: number;
  minimumFeeCents: number;
  riderSharePercent: number;
  active?: boolean;
}

export type UpdatePricingRuleInput = Partial<CreatePricingRuleInput>;

export interface LedgerListParams {
  orderId?: number;
  entryType?: LedgerEntryType;
  accountType?: AccountType;
  accountId?: number;
  limit?: number;
  offset?: number;
}

export interface CreateLedgerAdjustmentInput {
  accountType: AccountType;
  accountId: number;
  amountCents: number;
  description: string;
  idempotencyKey: string;
}

export type SettingValue = string | number | boolean | null;

export interface SystemSettings {
  site_name?: string;
  default_pricing_rule_id?: number;
  order_auto_cancel_minutes?: number;
}

export type UpdateSettingsInput = Partial<SystemSettings>;

export interface AuthResponse {
  user: User;
}

export interface OrdersListResponse {
  orders: Order[];
  pagination: Pagination;
}

export interface OrderResponse {
  order: Order;
  idempotent?: boolean;
}

export interface OrderEventsResponse {
  events: OrderEvent[];
}

export interface ChangeOrderStatusResponse extends OrderResponse {
  idempotent: boolean;
}

export interface MerchantsListResponse {
  merchants: Merchant[];
}

export interface MerchantResponse {
  merchant: Merchant;
}

export interface RidersListResponse {
  riders: Rider[];
}

export interface RiderResponse {
  rider: Rider;
}

export interface PricingRulesListResponse {
  pricingRules: PricingRule[];
}

export interface PricingRuleResponse {
  pricingRule: PricingRule;
}

export interface LedgerListResponse {
  entries: LedgerEntry[];
  pagination: Pagination;
}

export interface LedgerAdjustmentResponse {
  entry: LedgerEntry;
  idempotent: boolean;
}

export interface SettingsResponse {
  settings: SystemSettings;
}

export interface ApiErrorData {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiErrorResponse {
  error: ApiErrorData;
}
