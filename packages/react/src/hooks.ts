import { useCallback, useEffect, useState } from 'react';

export interface ReadHookResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Runs `readFn` and tracks its loading/data/error state.
 *
 * The read starts in an effect (so it never runs during render), results that
 * settle after unmount are ignored, and the effect re-runs whenever the
 * function identity changes (#836). `data` stays `null` until the read
 * resolves — nothing is fabricated.
 */
export function useVeritixRead<T>(readFn: () => Promise<T>): ReadHookResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    Promise.resolve()
      .then(readFn)
      .then((result) => {
        if (!active) return;
        setData(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [readFn]);

  return { data, loading, error };
}

/** Account summary returned by {@link AccountInfoClient.getAccountInfo}. */
export interface AccountInfo {
  address: string;
  /** Native (XLM) balance, as a decimal string, read from the network. */
  balance: string;
  /** Account sequence number, as a decimal string. */
  sequence?: string;
}

/** Minimal capability the account hook needs — satisfied by `VeriTixClient`. */
export interface AccountInfoClient {
  getAccountInfo(address: string): Promise<AccountInfo>;
}

/**
 * Reads live account info through `client.getAccountInfo()` (#837).
 *
 * `data` is `null` until the read resolves and the balance is never
 * hard-coded. With no address (or no client) there is nothing to read, so the
 * hook settles to `{ data: null, loading: false, error: null }`.
 */
export function useAccountInfo(
  accountAddress?: string,
  client?: AccountInfoClient | null,
): ReadHookResult<AccountInfo> {
  const enabled = Boolean(accountAddress && client);

  const readFn = useCallback(async (): Promise<AccountInfo | null> => {
    if (!accountAddress || !client) return null;
    return client.getAccountInfo(accountAddress);
  }, [accountAddress, client]);

  const { data, loading, error } = useVeritixRead<AccountInfo | null>(readFn);

  return {
    data,
    loading: enabled ? loading : false,
    error,
  };
}
