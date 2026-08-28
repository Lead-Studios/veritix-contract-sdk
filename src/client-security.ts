/**
 * Security utilities for VeriTixClient serialization.
 * Prevents accidental secret key leaking via console.log or JSON.stringify.
 */

/**
 * Custom toJSON() implementation that redacts sensitive fields.
 * Use this on VeriTixClient to safely stringify without exposing secrets.
 *
 * @example
 * const client = new VeriTixClient(config, keypair);
 * console.log(JSON.stringify(client)); // Safe: keypair is redacted
 */
export function createSafeToJSON(obj: any) {
  return function toJSON(this: any) {
    const safe = { ...this };
    if (safe.keypair) {
      safe.keypair = '[REDACTED_KEYPAIR]';
    }
    if (safe.secretKey) {
      safe.secretKey = '[REDACTED_SECRET]';
    }
    if (safe.server) {
      safe.server = '[REDACTED_SERVER_INSTANCE]';
    }
    return safe;
  };
}

/**
 * Custom inspect() handler for Node.js console output.
 * Prevents secret key leaking when using console.log or util.inspect.
 *
 * @example
 * const client = new VeriTixClient(config, keypair);
 * console.log(client); // Safe: keypair is redacted in output
 */
export function createSafeInspect() {
  return function inspect(this: any, _depth?: number, _opts?: unknown) {
    return 'VeriTixClient { ...config, keypair: [REDACTED], server: [REDACTED] }';
  };
}
