export type OrderSource = "manapool" | "tcgplayer";
export type SourceSyncState = "ok" | "error" | "idle";

export type CanonicalOrderInput = {
  sourceOrderId: string;
  status?: string;
  createdAt?: string;
  buyerId?: string;
  buyerName?: string;
  sellerName?: string;
  orderChannel?: string;
  orderFulfillment?: string;
  label?: string;
  totalCents?: number;
  shippingMethod?: string;
  latestFulfillmentStatus?: string;
  estimatedDeliveryAt?: string;
  buyerPaid?: boolean;
  trackingNumbers?: string[];
  allowedActions?: string[];
  refundStatus?: string;
  shippingAddress?: Record<string, unknown>;
  payment?: Record<string, unknown>;
  fulfillments?: unknown[];
  items?: unknown[];
  reports?: unknown[];
  tcgplayerSellerKey?: string;
  tcgplayerSummaryHash?: string;
};

export type OrderListItem = {
  id: string;
  source: OrderSource;
  sourceOrderId: string;
  createdAt?: string;
  status?: string;
  latestFulfillmentStatus?: string;
  buyerName?: string;
  totalCents?: number;
  shippingMethod?: string;
  syncUpdatedAt?: string;
};

export type SourceSyncStatus = {
  status: SourceSyncState;
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
};
