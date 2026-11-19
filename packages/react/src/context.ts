import React, { createContext, useContext, useMemo } from 'react';
import { VeriTixClient } from '@veritix/contract-sdk';
import type { NetworkConfig } from '@veritix/contract-sdk';

export type VeritixReactProviderConfig = NetworkConfig;

export const VeritixContext = createContext<VeritixClient | null>(null);

export interface VeritixProviderProps {
  client?: VeritixClient | null;
  config?: VeritixReactProviderConfig | null;
  children?: React.ReactNode;
}

export function VeritixProvider({
  client,
  config,
  children,
}: VeritixProviderProps): React.ReactElement {
  const resolvedClient = useMemo<VeritixClient | null>(
    () => (client === undefined && config ? new VeriTixClient(config) : client ?? null),
    [client, config],
  );

  return React.createElement(VeritixContext.Provider, { value: resolvedClient, children });
}

export function useVeriTix(): VeritixClient | null {
  return useContext(VeritixContext);
}
