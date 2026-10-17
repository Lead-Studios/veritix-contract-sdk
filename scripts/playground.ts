import * as repl from 'repl';

import { Keypair } from '@stellar/stellar-sdk';

import { getTestnetConfig, VeriTixClient } from '../src';

async function startPlayground() {
  const contractId = process.env.CONTRACT_ID;
  const secret = process.env.STELLAR_SECRET_KEY;

  if (!contractId || !secret) {
    console.error('Error: CONTRACT_ID and STELLAR_SECRET_KEY env vars required');
    process.exit(1);
  }

  // The constructor is `(config, keypair?)`; build the config with the real
  // factory and pass the signer as a Keypair (#838).
  const client = new VeriTixClient(getTestnetConfig(contractId), Keypair.fromSecret(secret));
  await client.connect();

  console.log('✓ VeriTixClient connected');
  console.log('Available: client.token, client.escrow, client.dispute');
  console.log('Type .exit to quit\n');

  const replServer = repl.start('veritix> ');
  replServer.context.client = client;
}

startPlayground().catch(console.error);
