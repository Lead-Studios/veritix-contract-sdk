import { Injectable } from '@nestjs/common';

@Injectable()
export class EventGalleryService {
  private galleries: Map<string, any> = new Map();

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

  getGallery(galleryId: string) {
    return this.galleries.get(galleryId);
  }

  listGalleries(eventId: string) {
    return Array.from(this.galleries.values())
      .filter(g => g.eventId === eventId);
  }

  deleteGallery(galleryId: string) {
    return this.galleries.delete(galleryId);
  }
}
