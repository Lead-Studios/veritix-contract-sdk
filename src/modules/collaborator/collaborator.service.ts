import { VeriTixError, VeriTixErrorCode } from '../../utils/errors';

/** A person collaborating on an event. */
export interface Collaborator {
  id: string;
  name: string;
  imageUrl: string;
  email: string;
  eventId: string;
}

/** Mutable fields of a {@link Collaborator}. */
export type CollaboratorUpdate = Partial<Pick<Collaborator, 'name' | 'imageUrl' | 'email'>>;

/** Maximum number of collaborators a single event may have. */
export const MAX_COLLABORATORS_PER_EVENT = 5;

/** In-memory management of event collaborators, capped per event. */
export class CollaboratorModule {
  private readonly collaborators = new Map<string, Collaborator>();

  public add(collaborator: Collaborator): Collaborator {
    if (this.collaborators.has(collaborator.id)) {
      throw new VeriTixError(
        VeriTixErrorCode.CollaboratorAlreadyExists,
        `Collaborator ${collaborator.id} already exists.`
      );
    }
    if (this.listByEvent(collaborator.eventId).length >= MAX_COLLABORATORS_PER_EVENT) {
      throw new VeriTixError(
        VeriTixErrorCode.MaxCollaboratorsReached,
        `Event ${collaborator.eventId} already has the maximum of ${MAX_COLLABORATORS_PER_EVENT} collaborators.`
      );
    }
    this.collaborators.set(collaborator.id, collaborator);
    return collaborator;
  }

  public get(id: string): Collaborator | undefined {
    return this.collaborators.get(id);
  }

  public list(): Collaborator[] {
    return Array.from(this.collaborators.values());
  }

  public listByEvent(eventId: string): Collaborator[] {
    return this.list().filter((entry) => entry.eventId === eventId);
  }

  public update(id: string, changes: CollaboratorUpdate): Collaborator {
    const existing = this.collaborators.get(id);
    if (!existing) {
      throw new VeriTixError(
        VeriTixErrorCode.CollaboratorNotFound,
        `Collaborator ${id} not found.`
      );
    }
    const updated: Collaborator = { ...existing, ...changes };
    this.collaborators.set(id, updated);
    return updated;
  }

  public remove(id: string): boolean {
    return this.collaborators.delete(id);
  }
}