export interface SplitConfig {
  organizerBps: number;
  artistBps: number;
}

export interface BpsValidationResult {
  isValid: boolean;
  platformBps: number;
  error?: string;
}
