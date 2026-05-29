/**
 * Reads a required environment variable and throws a clear error if missing.
 * Use at the top of every integration test file.
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}\n` +
        `Copy .env.example to .env and fill in all values before running integration tests.`,
    );
  }
  return value;
}
