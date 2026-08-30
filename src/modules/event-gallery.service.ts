import { Injectable } from '@nestjs/common';

@Injectable()
export class EventGalleryService {
  private galleries: Map<string, any> = new Map();

  /**
   * Creates a new media gallery for an event.
   *
   * @param eventId - Identifier of the event this gallery belongs to.
   * @param name    - Display name for the gallery.
   * @returns The newly created gallery object, including its generated ID.
   */
  createGallery(eventId: string, name: string) {
    const gallery = {
      id: `gallery_${Date.now()}`,
      eventId,
      name,
      createdAt: new Date(),
      media: []
    };
    this.galleries.set(gallery.id, gallery);
    return gallery;
  }

  /**
   * Retrieves a single gallery by its ID.
   *
   * @param galleryId - Unique identifier of the gallery.
   * @returns The gallery object, or `undefined` if no gallery with that ID exists.
   */
  getGallery(galleryId: string) {
    return this.galleries.get(galleryId);
  }

  /**
   * Lists all galleries belonging to a specific event.
   *
   * @param eventId - Identifier of the event to list galleries for.
   * @returns Array of gallery objects for the given event.
   */
  listGalleries(eventId: string) {
    return Array.from(this.galleries.values())
      .filter(g => g.eventId === eventId);
  }

  /**
   * Deletes a gallery by its ID.
   *
   * @param galleryId - Unique identifier of the gallery to delete.
   * @returns `true` if the gallery was found and removed, `false` otherwise.
   */
  deleteGallery(galleryId: string) {
    return this.galleries.delete(galleryId);
  }
}
