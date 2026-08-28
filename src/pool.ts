/**
 * @module pool
 * RPC pool implementation for VeriTixClient that distributes calls across multiple RPC endpoints
 * to support high-throughput backends with load balancing and health checking.
 */

import { Keypair, SorobanRpc } from '@stellar/stellar-sdk';
import type { VeriTixClient } from './client';
import type { NetworkConfig } from './types/index';
import { VeriTixError, VeriTixErrorCode } from './utils/errors';
import { Keypair } from '@stellar/stellar-sdk';

/**
 * Health status of an individual pool member
 */
export interface PoolMemberHealth {
  /** Whether the member is currently healthy */
  healthy: boolean;
  /** Number of consecutive errors encountered */
  consecutiveErrors: number;
  /** Total number of calls routed to this member */
  totalCalls: number;
  /** Last error message if any */
  lastError?: string;
  /** Network configuration of the member */
  config: NetworkConfig;
}

/**
 * Result of a pool-wide health check
 */
export interface PoolHealthStatus {
  /** Array of health statuses for all pool members */
  members: PoolMemberHealth[];
  /** Total number of healthy members */
  healthyCount: number;
  /** Total number of unhealthy members */
  unhealthyCount: number;
}

/**
 * A pool of VeriTixClient instances that distributes calls across multiple RPC endpoints
 * using round-robin load balancing with automatic health tracking.
 */
export class VeriTixClientPool {
  /** Array of client instances in the pool */
  private readonly clients: VeriTixClient[];
  /** Array of health statuses for each client */
  private readonly health: Map<VeriTixClient, PoolMemberHealth> = new Map();
  /** Next index to use for round-robin selection */
  private nextIndex = 0;
  /** Threshold of consecutive errors after which a member is marked unhealthy */
  private readonly errorThreshold = 5;

  /**
   * Creates a new VeriTixClientPool with the provided configurations
   * @param configs Array of NetworkConfig objects, one for each RPC endpoint
   * @param keypair Optional Keypair to use for all clients in the pool
   */
  constructor(clients: VeriTixClient[]) {
    if (clients.length === 0) {
      throw new VeriTixError(
        VeriTixErrorCode.InvalidAddress,
        'VeriTixClientPool: at least one client is required'
      );
    }

    // Store the clients and initialize their health status
    this.clients = clients;
    this.clients.forEach(client => {
      this.health.set(client, {
        healthy: true,
        consecutiveErrors: 0,
        totalCalls: 0,
        config: client.config,
      });
    });
  }

  /**
   * Gets the next healthy client from the pool using round-robin selection
   * @returns The next client to use
   * @throws {VeriTixError} If no healthy clients are available
   */
  private getNextClient(): VeriTixClient {
    const healthyClients = this.clients.filter(client => this.health.get(client)!.healthy);
    
    if (healthyClients.length === 0) {
      throw new VeriTixError(
        VeriTixErrorCode.ConnectionFailed,
        'VeriTixClientPool: no healthy RPC endpoints available'
      );
    }

    // Find the index of the next client in the full list
    let attempts = 0;
    while (attempts < this.clients.length) {
      const client = this.clients[this.nextIndex];
      this.nextIndex = (this.nextIndex + 1) % this.clients.length;
      
      if (this.health.get(client)!.healthy) {
        const health = this.health.get(client)!;
        health.totalCalls++;
        return client;
      }
      attempts++;
    }

    // This should never happen since we checked healthyClients.length > 0
    throw new VeriTixError(
      VeriTixErrorCode.ConnectionFailed,
      'VeriTixClientPool: failed to find a healthy client'
    );
  }

  /**
   * Marks a client as unhealthy after encountering errors
   * @param client The client that encountered an error
   * @param error The error that occurred
   */
  private markClientUnhealthy(client: VeriTixClient, error: Error): void {
    const health = this.health.get(client)!;
    health.consecutiveErrors++;
    health.lastError = error.message;
    
    if (health.consecutiveErrors >= this.errorThreshold) {
      health.healthy = false;
    }
  }

  /**
   * Resets the error count for a client that successfully processed a call
   * @param client The client that processed the call successfully
   */
  private markClientHealthy(client: VeriTixClient): void {
    const health = this.health.get(client)!;
    health.consecutiveErrors = 0;
    health.lastError = undefined;
    health.healthy = true;
  }

  /**
   * Executes a function on the next available client, handling health tracking
   * @param fn The function to execute on the client
   * @returns The result of the function
   */
  private async executeOnClient<T>(fn: (client: VeriTixClient) => Promise<T>): Promise<T> {
    const client = this.getNextClient();
    
    try {
      const result = await fn(client);
      this.markClientHealthy(client);
      return result;
    } catch (error) {
      this.markClientUnhealthy(client, error as Error);
      throw error;
    }
  }

  /**
   * Performs a health check on all pool members and updates their health status
   * @returns The overall pool health status
   */
  async healthCheck(): Promise<PoolHealthStatus> {
    const healthPromises = this.clients.map(async (client) => {
      const health = this.health.get(client)!;
      try {
        // Try to get the current ledger to check if the client is connected and working
        await client.getCurrentLedger();
        this.markClientHealthy(client);
      } catch (error) {
        this.markClientUnhealthy(client, error as Error);
      }
      return { ...this.health.get(client)! };
    });

    const members = await Promise.all(healthPromises);
    const healthyCount = members.filter(m => m.healthy).length;
    
    return {
      members,
      healthyCount,
      unhealthyCount: members.length - healthyCount,
    };
  }

  /**
   * Forwards all method calls to the next available client in the pool
   * This proxy handles all public methods of VeriTixClient
   */
  public readonly proxy: VeriTixClient = new Proxy({} as VeriTixClient, {
    get: (target, prop) => {
      // If the property exists on the pool itself, return it
      if (prop in this) {
        return (this as unknown as Record<string, unknown>)[prop];
      }

      // Otherwise, return a function that executes the method on the next client
      return (...args: unknown[]) => {
        return this.executeOnClient(client => {
          const method = (client as unknown as Record<string, unknown>)[prop];
          if (typeof method !== 'function') {
            return method;
          }
          return method.apply(client, args);
        });
      };
    },
  });
}