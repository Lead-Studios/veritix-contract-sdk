export interface AdminRotationState {
  currentAdmin: string;
  pendingAdmin?: string | null;
}

export function proposeAdmin(state: AdminRotationState, newAdmin: string): AdminRotationState {
  return {
    ...state,
    pendingAdmin: newAdmin,
  };
}

export function acceptAdmin(state: AdminRotationState): AdminRotationState {
  if (!state.pendingAdmin) {
    throw new Error('No pending admin proposal to accept.');
  }
  return {
    currentAdmin: state.pendingAdmin,
    pendingAdmin: null,
  };
}

export function getPendingAdmin(state: AdminRotationState): string | null {
  return state.pendingAdmin || null;
}
