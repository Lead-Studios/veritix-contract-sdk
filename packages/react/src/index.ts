/**
 * @module @veritix/contract-sdk-react
 * React context and hooks for the VeriTix contract SDK.
 *
 * @example
 * ```tsx
 * import { VeriTixProvider, useBalance, useEscrow } from '@veritix/contract-sdk-react';
 *
 * function App() {
 *   return (
 *     <VeriTixProvider client={sdkClient}>
 *       <Wallet />
 *     </VeriTixProvider>
 *   );
 * }
 *
 * function Wallet() {
 *   const { balance, loading } = useBalance('GABC…');
 *   return <p>{loading ? '…' : balance?.toString()}</p>;
 * }
 * ```
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { VeriTixClient, EscrowRecord } from '@veritix/contract-sdk';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const VeriTixContext = createContext<VeriTixClient | null>(null);

/**
 * Provides a `VeriTixClient` instance to all descendant hooks.
 *
 * @example
 * ```tsx
 * <VeriTixProvider client={client}>
 *   <App />
 * </VeriTixProvider>
 * ```
 */
export function VeriTixProvider({
  client,
  children,
}: {
  client: VeriTixClient;
  children: ReactNode;
}) {
  return (
    <VeriTixContext.Provider value={client}>
      {children}
    </VeriTixContext.Provider>
  );
}

/**
 * Returns the `VeriTixClient` instance from the nearest `VeriTixProvider`.
 * Throws if called outside of a provider.
 *
 * @example
 * ```ts
 * const client = useVeriTixClient();
 * await client.token.balance('GABC…');
 * ```
 */
export function useVeriTixClient(): VeriTixClient {
  const client = useContext(VeriTixContext);
  if (!client) {
    throw new Error('useVeriTixClient must be used inside a <VeriTixProvider>');
  }
  return client;
}

// ---------------------------------------------------------------------------
// useBalance
// ---------------------------------------------------------------------------

export interface UseBalanceResult {
  balance: bigint | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Fetches the token balance for `address` and re-fetches whenever the address changes.
 *
 * @param address - Stellar account address to query.
 * @returns `{ balance, loading, error }`.
 *
 * @example
 * ```tsx
 * const { balance, loading, error } = useBalance('GABC…');
 * if (loading) return <Spinner />;
 * return <p>Balance: {balance?.toString()} stroops</p>;
 * ```
 */
export function useBalance(address: string): UseBalanceResult {
  const client = useVeriTixClient();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    client.token
      .balance(address)
      .then((b) => { if (!cancelled) { setBalance(b); setLoading(false); } })
      .catch((e: unknown) => { if (!cancelled) { setError(e as Error); setLoading(false); } });

    return () => { cancelled = true; };
  }, [client, address]);

  return { balance, loading, error };
}

// ---------------------------------------------------------------------------
// useEscrow
// ---------------------------------------------------------------------------

export interface UseEscrowResult {
  escrow: EscrowRecord | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Fetches an escrow record by ID. Exposes a `refetch` function to manually refresh.
 *
 * @param id - Numeric escrow identifier.
 * @returns `{ escrow, loading, error, refetch }`.
 *
 * @example
 * ```tsx
 * const { escrow, loading, refetch } = useEscrow(1n);
 * if (loading) return <Spinner />;
 * return (
 *   <div>
 *     <p>Beneficiary: {escrow?.beneficiary}</p>
 *     <button onClick={refetch}>Refresh</button>
 *   </div>
 * );
 * ```
 */
export function useEscrow(id: bigint): UseEscrowResult {
  const client = useVeriTixClient();
  const [escrow, setEscrow] = useState<EscrowRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    client.escrow
      .getEscrow(id)
      .then((e) => { if (!cancelled) { setEscrow(e); setLoading(false); } })
      .catch((e: unknown) => { if (!cancelled) { setError(e as Error); setLoading(false); } });

    return () => { cancelled = true; };
  }, [client, id, tick]);

  return { escrow, loading, error, refetch };
}
