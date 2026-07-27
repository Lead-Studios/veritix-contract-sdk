/** Time buckets supported by ticket order reports. */
export type TicketPeriod = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';

/** Export formats accepted by {@link TicketAnalyticsModule.export}. */
export type ExportFormat = 'csv' | 'xls';

/** A single ticket order placed against an event. */
export interface TicketOrder {
  eventId: string;
  quantity: number;
  orderedAt: Date;
}

/** Ticket order reporting for a single event. */
export class TicketAnalyticsModule {
  /** Total tickets ordered for the event across all time. */
  public totalOrdered(orders: TicketOrder[], eventId: string): number {
    return orders
      .filter((order) => order.eventId === eventId)
      .reduce((sum, order) => sum + order.quantity, 0);
  }

  /** Tickets ordered per bucket, keyed by bucket label and sorted ascending. */
  public breakdown(
    orders: TicketOrder[],
    eventId: string,
    period: TicketPeriod,
  ): Record<string, number> {
    const buckets = new Map<string, number>();
    for (const order of orders.filter((entry) => entry.eventId === eventId)) {
      const key = this.bucketKey(order.orderedAt, period);
      buckets.set(key, (buckets.get(key) ?? 0) + order.quantity);
    }
    return Object.fromEntries(Array.from(buckets).sort(([a], [b]) => a.localeCompare(b)));
  }

  /** Renders a breakdown as delimited text; `xls` uses tab separation. */
  public export(breakdown: Record<string, number>, format: ExportFormat): string {
    const separator = format === 'xls' ? '\t' : ',';
    const rows = Object.entries(breakdown).map(([key, total]) => `${key}${separator}${total}`);
    return [`period${separator}tickets`, ...rows].join('\n');
  }

  private bucketKey(date: Date, period: TicketPeriod): string {
    const iso = date.toISOString();
    if (period === 'hourly') return iso.slice(0, 13);
    if (period === 'daily') return iso.slice(0, 10);
    if (period === 'monthly') return iso.slice(0, 7);
    if (period === 'yearly') return iso.slice(0, 4);
    const monday = new Date(date);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    return monday.toISOString().slice(0, 10);
  }
}
