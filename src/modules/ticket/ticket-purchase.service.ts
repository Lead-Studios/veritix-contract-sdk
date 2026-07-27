/** Billing contact captured at checkout. */
export interface BillingDetails {
  fullName: string;
  email: string;
  phoneNumber: string;
}

/** Postal address captured at checkout. */
export interface AddressDetails {
  country: string;
  state: string;
  city: string;
  street: string;
  postalCode: string;
}

/** A request to buy one or more tickets for an event. */
export interface PurchaseRequest {
  userId: string;
  eventId: string;
  quantity: number;
  pricePerTicket: number;
  billing: BillingDetails;
  address: AddressDetails;
}

/** Proof of a completed purchase. */
export interface Receipt extends PurchaseRequest {
  receiptId: string;
  totalPrice: number;
  purchasedAt: Date;
}

/** Ticket checkout, issuing a receipt per confirmed order. */
export class TicketPurchaseModule {
  private readonly receipts = new Map<string, Receipt>();

  /** Confirms a purchase against remaining availability and stores a receipt. */
  public purchase(orderId: string, request: PurchaseRequest, available: number): Receipt {
    if (!Number.isInteger(request.quantity) || request.quantity < 1) {
      throw new Error('Ticket quantity must be a positive integer.');
    }
    if (request.quantity > available) {
      throw new Error(
        `Only ${available} ticket(s) remain for event ${request.eventId}; ` +
          `${request.quantity} requested.`,
      );
    }
    const receipt: Receipt = {
      ...request,
      receiptId: orderId,
      totalPrice: request.quantity * request.pricePerTicket,
      purchasedAt: new Date(),
    };
    this.receipts.set(orderId, receipt);
    return receipt;
  }

  /** Retrieves the receipt for a confirmed order. */
  public getReceipt(orderId: string): Receipt | undefined {
    return this.receipts.get(orderId);
  }
}
