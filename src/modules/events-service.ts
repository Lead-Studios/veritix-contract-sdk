/**
 * Events Retrieval Service
 * Provides comprehensive API for fetching and filtering events
 */

export interface Event {
  id: bigint;
  name: string;
  organizer: string;
  date: number;
  ticketPrice: bigint;
  capacity: number;
  ticketsSold: number;
  status: 'active' | 'completed' | 'cancelled';
  revenue?: bigint;
}

export interface EventFilter {
  organizer?: string;
  status?: 'active' | 'completed' | 'cancelled';
  minDate?: number;
  maxDate?: number;
}

export class EventsService {
  private events: Event[] = [];

  /**
   * Retrieve all events
   * @returns Array of all events
   */
  async getAllEvents(): Promise<Event[]> {
    return this.events;
  }

  /**
   * Retrieve events with filters
   * @param filter - Optional filter criteria
   * @returns Filtered array of events
   */
  async getEvents(filter?: EventFilter): Promise<Event[]> {
    if (!filter) return this.events;

    return this.events.filter((e) => {
      if (filter.organizer && e.organizer !== filter.organizer) return false;
      if (filter.status && e.status !== filter.status) return false;
      if (filter.minDate && e.date < filter.minDate) return false;
      if (filter.maxDate && e.date > filter.maxDate) return false;
      return true;
    });
  }

  /**
   * Get single event by ID
   * @param id - Event ID
   * @returns Event or null if not found
   */
  async getEventById(id: bigint): Promise<Event | null> {
    return this.events.find((e) => e.id === id) || null;
  }
}
