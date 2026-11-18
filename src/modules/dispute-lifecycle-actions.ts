/**
 * @module modules/dispute-lifecycle-actions
 * Dispute expiry and appeal actions (#654, #655, #896, #897).
 *
 * A third companion to `./dispute.ts` (read-only DisputeModule) and
 * `./dispute-actions.ts` (open/resolve/listing). All action modules share the
 * `ContractInvoker` capability declared in `../types`.
 */
import type { ContractInvoker, DisputeRecord } from '../types';
import { VeriTixError, VeriTixErrorCode } from '../utils/errors';
import { decodeDisputeRecord } from './dispute';

/**
 * SDK-local pre-flight rule: a dispute may be expired once this many ledgers
 * have elapsed since it was opened. It is not an on-chain constant, and is
 * intentionally independent of any contract-side expiry rule.
 */
const LOCAL_DISPUTE_RESOLUTION_WINDOW_LEDGERS = 17_280;

/** SDK-local fallback appeal window: two hours at a five-second ledger time. */
const LOCAL_DISPUTE_APPEAL_WINDOW_LEDGERS = 1_440;

interface AppealableDisputeRecord extends DisputeRecord {
  winner?: string;
  appealDeadlineLedger?: number;
  resolvedAtLedger?: number;
}

function firstDefined(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }
  return undefined;
}

function asLedger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (
    typeof value === 'bigint' &&
    value >= BigInt(Number.MIN_SAFE_INTEGER) &&
    value <= BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return Number(value);
  }
  throw new VeriTixError(
    VeriTixErrorCode.SimulationFailed,
    `dispute record field ${field} is not a valid ledger sequence`,
  );
}

async function readRawDispute(
  invoker: ContractInvoker,
  method: string,
  escrowId: bigint
): Promise<Record<string, unknown>> {
  const raw = await invoker.simulateRead('get_dispute', [escrowId]);
  if (raw === null || raw === undefined) {
    throw new VeriTixError(
      VeriTixErrorCode.DisputeNotFound,
      `${method}: no dispute found for escrow ${escrowId}`,
    );
  }
  if (typeof raw !== 'object') {
    throw new VeriTixError(
      VeriTixErrorCode.SimulationFailed,
      `${method}: get_dispute did not return a dispute record`,
    );
  }
  return raw as Record<string, unknown>;
}

function decodeRecord(raw: Record<string, unknown>, method: string): DisputeRecord {
  try {
    return decodeDisputeRecord(raw);
  } catch (err) {
    throw new VeriTixError(
      VeriTixErrorCode.SimulationFailed,
      `${method}: get_dispute returned an invalid dispute record`,
      err instanceof Error ? err.message : String(err),
      err,
    );
  }
}

async function readCurrentLedger(invoker: ContractInvoker, method: string): Promise<number> {
  if (typeof invoker.getCurrentLedger !== 'function') {
    throw new VeriTixError(
      VeriTixErrorCode.NotImplemented,
      `${method}: getCurrentLedger capability is required for this pre-flight check`,
    );
  }
  const ledger = await invoker.getCurrentLedger();
  if (!Number.isSafeInteger(ledger)) {
    throw new VeriTixError(
      VeriTixErrorCode.SimulationFailed,
      `${method}: getCurrentLedger returned an invalid ledger sequence`,
    );
  }
  return ledger;
}

function readAppealRecord(raw: Record<string, unknown>, method: string): AppealableDisputeRecord {
  const record = decodeRecord(raw, method);
  const winner = firstDefined(raw, [
    'winner',
    'resolved_winner',
    'resolvedWinner',
    'winner_address',
    'winnerAddress',
  ]);
  const appealDeadline = firstDefined(raw, [
    'appeal_deadline',
    'appealDeadline',
    'appeal_deadline_ledger',
    'appealDeadlineLedger',
    'appeal_window_end',
    'appealWindowEnd',
    'appeal_end_ledger',
    'appealEndLedger',
  ]);
  const resolvedAt = firstDefined(raw, [
    'resolved_at',
    'resolvedAt',
    'resolved_at_ledger',
    'resolvedAtLedger',
    'resolution_ledger',
    'resolutionLedger',
    'resolved_ledger',
    'resolvedLedger',
  ]);

  if (winner !== undefined && typeof winner !== 'string') {
    throw new VeriTixError(
      VeriTixErrorCode.SimulationFailed,
      `${method}: dispute record winner is not an address`,
    );
  }

  return {
    ...record,
    ...(winner === undefined ? {} : { winner }),
    ...(appealDeadline === undefined
      ? {}
      : { appealDeadlineLedger: asLedger(appealDeadline, 'appeal deadline') }),
    ...(resolvedAt === undefined ? {} : { resolvedAtLedger: asLedger(resolvedAt, 'resolved at') }),
  };
}

/**
 * Sweeps an abandoned dispute once the SDK-local resolution window has elapsed
 * (#654, #896), transitioning it to `"expired"` so the escrow can be unblocked.
 *
 * The contract entrypoint remains `expire_dispute(caller, escrow_id)` and
 * returns nothing.
 */
export async function expireDispute(
  invoker: ContractInvoker,
  caller: string,
  escrowId: bigint
): Promise<void> {
  if (escrowId < 0n) {
    throw new VeriTixError(VeriTixErrorCode.InvalidInput, `invalid escrow id: ${escrowId}`);
  }

  const raw = await readRawDispute(invoker, 'expireDispute', escrowId);
  const dispute = decodeRecord(raw, 'expireDispute');
  const status = dispute.status.toLowerCase();

  if (status.startsWith('resolved')) {
    throw new VeriTixError(
      VeriTixErrorCode.DisputeAlreadyResolved,
      `expireDispute: dispute ${escrowId} has already been resolved`,
    );
  }
  if (status === 'expired') {
    throw new VeriTixError(
      VeriTixErrorCode.DisputeInvalidState,
      `expireDispute: dispute ${escrowId} is already expired`,
    );
  }

  const currentLedger = await readCurrentLedger(invoker, 'expireDispute');
  const expiryLedger = dispute.openedAt + LOCAL_DISPUTE_RESOLUTION_WINDOW_LEDGERS;
  const ledgersRemaining = expiryLedger - currentLedger;

  if (ledgersRemaining > 0) {
    throw new VeriTixError(
      VeriTixErrorCode.InvalidExpiryLedger,
      `expireDispute: resolution window has not passed: ${ledgersRemaining} ledger(s) remain`,
      String(ledgersRemaining),
    );
  }

  await invoker.invoke('expire_dispute', [caller, escrowId]);
}

/**
 * Appeals a resolved dispute via `appeal_dispute(caller, escrow_id)` (#655,
 * #897). Non-empty caller input, dispute state, appeal deadline, and winner
 * checks all run locally before the contract call.
 */
export async function appealDispute(
  invoker: ContractInvoker,
  caller: string,
  escrowId: bigint
): Promise<void> {
  if (typeof caller !== 'string' || caller.trim().length === 0) {
    throw new VeriTixError(
      VeriTixErrorCode.InvalidInput,
      'appealDispute: a non-empty caller address is required',
    );
  }
  if (escrowId < 0n) {
    throw new VeriTixError(VeriTixErrorCode.InvalidInput, `invalid escrow id: ${escrowId}`);
  }

  const raw = await readRawDispute(invoker, 'appealDispute', escrowId);
  const dispute = readAppealRecord(raw, 'appealDispute');
  const status = dispute.status.toLowerCase();

  if (status !== 'resolved' && !status.startsWith('resolved')) {
    throw new VeriTixError(
      VeriTixErrorCode.DisputeInvalidState,
      `appealDispute: dispute ${escrowId} is not resolved`,
    );
  }
  if (dispute.winner !== undefined && dispute.winner === caller) {
    throw new VeriTixError(
      VeriTixErrorCode.Unauthorized,
      'appealDispute: the declared winner cannot appeal the dispute',
    );
  }

  const currentLedger = await readCurrentLedger(invoker, 'appealDispute');
  const appealDeadlineLedger =
    dispute.appealDeadlineLedger ??
    (dispute.resolvedAtLedger === undefined
      ? dispute.openedAt +
        LOCAL_DISPUTE_RESOLUTION_WINDOW_LEDGERS +
        LOCAL_DISPUTE_APPEAL_WINDOW_LEDGERS
      : dispute.resolvedAtLedger + LOCAL_DISPUTE_APPEAL_WINDOW_LEDGERS);

  if (currentLedger >= appealDeadlineLedger) {
    throw new VeriTixError(
      VeriTixErrorCode.InvalidExpiryLedger,
      `appealDispute: the appeal window has closed for escrow ${escrowId}`,
      String(currentLedger - appealDeadlineLedger),
    );
  }

  await invoker.invoke('appeal_dispute', [caller, escrowId]);
}
