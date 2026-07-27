/** Time windows supported by revenue and profit reports. */
export type RevenuePeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

/** A single completed ticket sale. */
export interface TicketSale {
  eventId: string;
  amount: number;
  soldAt: Date;
}

/** Platform transaction charge deducted from revenue to yield profit. */
export const TRANSACTION_CHARGE_RATE = 0.1;

const MS_PER_DAY = 86_400_000;

const PERIOD_DAYS: Record<RevenuePeriod, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  yearly: 365,
};

/** Revenue and profit reporting for a single event. */
export class RevenueAnalyticsModule {
  /** Sum of every sale recorded for the event. */
  public totalRevenue(sales: TicketSale[], eventId: string): number {
    return sales
      .filter((sale) => sale.eventId === eventId)
      .reduce((sum, sale) => sum + sale.amount, 0);
  }

  /** Total revenue less the {@link TRANSACTION_CHARGE_RATE} charge. */
  public totalProfit(sales: TicketSale[], eventId: string): number {
    return this.deductCharge(this.totalRevenue(sales, eventId));
  }

  /** Revenue from sales falling inside the trailing `period`. */
  public revenueByPeriod(
    sales: TicketSale[],
    eventId: string,
    period: RevenuePeriod,
    now: Date = new Date(),
  ): number {
    const cutoff = now.getTime() - PERIOD_DAYS[period] * MS_PER_DAY;
    return this.totalRevenue(
      sales.filter((sale) => sale.soldAt.getTime() >= cutoff),
      eventId,
    );
  }

  /** Profit from sales falling inside the trailing `period`. */
  public profitByPeriod(
    sales: TicketSale[],
    eventId: string,
    period: RevenuePeriod,
    now: Date = new Date(),
  ): number {
    return this.deductCharge(this.revenueByPeriod(sales, eventId, period, now));
  }

  private deductCharge(revenue: number): number {
    return revenue - revenue * TRANSACTION_CHARGE_RATE;
  }
}
