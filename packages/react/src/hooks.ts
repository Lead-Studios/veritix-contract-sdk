export interface ReadHookResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export function useVeritixRead<T>(readFn: () => Promise<T>): ReadHookResult<T> {
  return {
    data: null,
    loading: false,
    error: null,
  };
}

export function useAccountInfo(accountAddress?: string): ReadHookResult<{ address: string; balance: string }> {
  return {
    data: accountAddress ? { address: accountAddress, balance: '0' } : null,
    loading: false,
    error: null,
  };
}
