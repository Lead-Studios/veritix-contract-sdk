export interface PauseState {
  isPaused: boolean;
  updatedAt: number;
}

export function pause(): PauseState {
  return { isPaused: true, updatedAt: Date.now() };
}

export function unpause(): PauseState {
  return { isPaused: false, updatedAt: Date.now() };
}
