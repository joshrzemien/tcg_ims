export interface AddressInput {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  name?: string;
  company?: string;
  phone?: string;
  email?: string;
}

export interface VerifiedAddress {
  easypostAddressId: string;
  isVerified: boolean;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  verificationErrors: string[];
}

export interface ParcelInput {
  length: number;
  width: number;
  height: number;
  weight: number;
}

export interface ShipmentRate {
  rateId: string;
  carrier: string;
  service: string;
  rateCents: number;
  deliveryDays: number | null;
}

export interface CreatedShipment {
  easypostShipmentId: string;
  rates: ShipmentRate[];
}

export interface RetrievedShipment {
  easypostShipmentId: string;
  rates: ShipmentRate[];
  purchased: boolean;
  purchasedData: PurchasedShipment | null;
}

export interface PurchasedShipment {
  trackingNumber: string;
  labelUrl: string;
  rateCents: number;
  carrier: string;
  service: string;
  easypostTrackerId: string;
}

export interface RefundResult {
  easypostRefundStatus:
    | "submitted"
    | "refunded"
    | "rejected"
    | "not_applicable"
    | "unknown";
}
