// Factory for creating VeriTixClient from the Freighter wallet.
//
// The canonical implementation lives on {@link VeriTixClient.createFromFreighter}
// (see src/client.ts). This module delegates to it so callers can keep using a
// standalone `createFromFreighter` helper. It dynamically imports the client to
// avoid a circular dependency.
import type { VeriTixClient } from '../client';
import type { NetworkConfig } from '../types/index';
import { VeriTixError, VeriTixErrorCode } from '../utils/errors';

/**
 * Creates a Freighter-backed {@link VeriTixClient} for the given config.
 *
 * @param config - Network and contract configuration.
 * @returns A new Freighter-backed client (caller must still call `connect()`).
 * @throws {VeriTixError} With code `InvalidAddress` if Freighter is unavailable.
 *
 * @deprecated Prefer {@link VeriTixClient.createFromFreighter} directly.
 */
export async function createFromFreighter(
  config: NetworkConfig,
): Promise<VeriTixClient> {
  const { VeriTixClient: Client } = await import('../client').catch(() => {
    throw new VeriTixError(
      VeriTixErrorCode.InvalidAddress,
      'Freighter wallet not available: unable to load the VeriTix SDK client module.',
    );
  });
  return Client.createFromFreighter(config);
}
// Factory for creating VeriTixClient from Freighter wallet
import { VeriTixClient } from '../client';
import { VeriTixError, VeriTixErrorCode } from '../utils/errors';

export async function createFromFreighter(network: string = 'testnet') {
  try {
    const freighter = (window as any).freighter;
    if (!freighter) {
      throw new VeriTixError(
        VeriTixErrorCode.FreighterNotFound,
        'Freighter wallet not found'
      );
    }
    const publicKey = await freighter.getPublicKey();
    return new VeriTixClient({
      network,
      signer: freighter,
      publicKey
    });
  } catch (error) {
    console.error('Failed to connect to Freighter:', error);
    throw error;
  }
}
