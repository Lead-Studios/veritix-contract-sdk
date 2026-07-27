import * as repl from 'repl';
import { VeriTixClient } from '../src';

async function startPlayground() {
  const contractId = process.env.CONTRACT_ID;
  const network = process.env.STELLAR_NETWORK || 'testnet';
  const secretKey = process.env.STELLAR_SECRET_KEY;

  if (!contractId || !secretKey) {
    console.error('Error: CONTRACT_ID and STELLAR_SECRET_KEY env vars required');
    process.exit(1);
  }

  const client = new VeriTixClient({ contractId, network, secretKey });
  await client.connect();

  console.log('✓ VeriTixClient connected');
  console.log('Available: client.escrow, client.dispute, client.recurring');
  console.log('Type .exit to quit\n');

  const replServer = repl.start('veritix> ');
  replServer.context.client = client;
}

startPlayground().catch(console.error);
