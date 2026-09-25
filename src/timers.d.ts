/**
 * Minimal timer bindings for the SDK.
 *
 * The project's `tsconfig` ships lib ES2020 only (no DOM, no @types/node), so
 * node-style or browser-style `setTimeout` typings cannot be relied on. These
 * ambient declarations give the polling helpers the single binding they need.
 */
declare function setTimeout(callback: () => void, ms?: number): number;