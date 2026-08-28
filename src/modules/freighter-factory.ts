// Factory for creating VeriTixClient from Freighter wallet
import { VeriTixClient } from '../client';

export async function createFromFreighter(network: string = 'testnet') {
  try {
    const freighter = (window as any).freighter;
    if (!freighter) {
      throw new Error('Freighter wallet not found');
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