/**
 * @module utils/parsers
 * Parsers that convert Soroban `ScVal` (XDR) responses into the typed
 * TypeScript interfaces defined in `src/types/index.ts`.
 *
 * Each parser expects a `ScvMap` value whose keys are `ScvSymbol` strings
 * matching the field names used in the VeriTix Soroban contract structs.
 */
import { xdr, scValToNative } from '@stellar/stellar-sdk';
import type {
  EscrowRecord,
  SplitRecord,
  SplitRecipient,
  DisputeRecord,
  RecurringRecord,
} from '../types/index';
import { DisputeStatus } from '../types/index';
import {
  scValToBigint,
  scValToBoolean,
  scValToNumber,
  scValToString,
} from './scval';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the entries of an `ScvMap` as a `Map<string, xdr.ScVal>`.
 *
 * @throws {Error} if `val` is not an `ScvMap`.
 */
function scMapToRecord(val: xdr.ScVal): Map<string, xdr.ScVal> {
  if (val.switch() !== xdr.ScValType.scvMap()) {
    throw new Error(
      `Expected ScvMap, got ScVal type: ${val.switch().name}`,
    );
  }
  const map = new Map<string, xdr.ScVal>();
  for (const entry of val.map()!) {
    const key = scValToNative(entry.key()) as string;
    map.set(key, entry.val());
  }
  return map;
}

/**
 * Retrieves a required field from an `ScvMap` record.
 *
 * @throws {Error} if the field is absent.
 */
function getField(map: Map<string, xdr.ScVal>, field: string): xdr.ScVal {
  const val = map.get(field);
  if (val === undefined) {
    throw new Error(`Missing required field "${field}" in ScvMap`);
  }
  return val;
}

// ---------------------------------------------------------------------------
// Public parsers
// ---------------------------------------------------------------------------

/**
 * Parses a Soroban `ScVal` returned by an escrow view method into an
 * {@link EscrowRecord}.
 *
 * Expected ScvMap keys: `id`, `depositor`, `beneficiary`, `amount`,
 * `released`, `refunded`, `expiry_ledger`, `memos`
 *
 * @throws {Error} if any required field is missing or has the wrong type.
 */
export function parseEscrowRecord(val: xdr.ScVal): EscrowRecord {
  const map = scMapToRecord(val);

  const memosVal = getField(map, 'memos');
  let memos: string[] = [];
  if (memosVal.switch() === xdr.ScValType.scvVec()) {
    memos = (memosVal.vec() ?? []).map((item) => scValToString(item));
  }

  return {
    id:            scValToBigint(getField(map, 'id')),
    depositor:     scValToString(getField(map, 'depositor')),
    beneficiary:   scValToString(getField(map, 'beneficiary')),
    amount:        scValToBigint(getField(map, 'amount')),
    released:      scValToBoolean(getField(map, 'released')),
    refunded:      scValToBoolean(getField(map, 'refunded')),
    expiryLedger:  scValToNumber(getField(map, 'expiry_ledger')),
    memos,
  };
}

/**
 * Parses a Soroban `ScVal` returned by a split view method into a
 * {@link SplitRecord}.
 *
 * Expected ScvMap keys: `id`, `sender`, `recipients`, `total_amount`,
 * `distributed`, `cancelled`
 *
 * The `recipients` field must be an `ScvVec` of `ScvMap` entries, each
 * containing `address` (string) and `share_bps` (number).
 *
 * @throws {Error} if any required field is missing or has the wrong type.
 */
export function parseSplitRecord(val: xdr.ScVal): SplitRecord {
  const map = scMapToRecord(val);

  const recipientsVal = getField(map, 'recipients');
  if (recipientsVal.switch() !== xdr.ScValType.scvVec()) {
    throw new Error('Field "recipients" must be an ScvVec');
  }

  const recipients: SplitRecipient[] = (recipientsVal.vec() ?? []).map((item) => {
    const rMap = scMapToRecord(item);
    return {
      address:  scValToString(getField(rMap, 'address')),
      shareBps: scValToNumber(getField(rMap, 'share_bps')),
    };
  });

  return {
    id:          scValToBigint(getField(map, 'id')),
    sender:      scValToString(getField(map, 'sender')),
    recipients,
    totalAmount: scValToBigint(getField(map, 'total_amount')),
    distributed: scValToBoolean(getField(map, 'distributed')),
    cancelled:   scValToBoolean(getField(map, 'cancelled')),
  };
}

/**
 * Parses a Soroban `ScVal` returned by a dispute view method into a
 * {@link DisputeRecord}.
 *
 * Expected ScvMap keys: `id`, `escrow_id`, `claimant`, `resolver`,
 * `status`, `opened_at`
 *
 * The `status` field must be an `ScvSymbol` whose value matches one of the
 * {@link DisputeStatus} enum members.
 *
 * @throws {Error} if any required field is missing or has the wrong type.
 */
export function parseDisputeRecord(val: xdr.ScVal): DisputeRecord {
  const map = scMapToRecord(val);

  const statusRaw = scValToString(getField(map, 'status'));
  const status = parseDisputeStatus(statusRaw);

  return {
    id:        scValToBigint(getField(map, 'id')),
    escrowId:  scValToBigint(getField(map, 'escrow_id')),
    claimant:  scValToString(getField(map, 'claimant')),
    resolver:  scValToString(getField(map, 'resolver')),
    status,
    openedAt:  scValToNumber(getField(map, 'opened_at')),
  };
}

/**
 * Parses a Soroban `ScVal` returned by a recurring-payment view method into
 * a {@link RecurringRecord}.
 *
 * Expected ScvMap keys: `id`, `payer`, `payee`, `amount`, `interval`,
 * `active`, `last_charged_ledger`
 *
 * @throws {Error} if any required field is missing or has the wrong type.
 */
export function parseRecurringRecord(val: xdr.ScVal): RecurringRecord {
  const map = scMapToRecord(val);

  return {
    id:                 scValToBigint(getField(map, 'id')),
    payer:              scValToString(getField(map, 'payer')),
    payee:              scValToString(getField(map, 'payee')),
    amount:             scValToBigint(getField(map, 'amount')),
    interval:           scValToNumber(getField(map, 'interval')),
    active:             scValToBoolean(getField(map, 'active')),
    lastChargedLedger:  scValToNumber(getField(map, 'last_charged_ledger')),
  };
}

// ---------------------------------------------------------------------------
// Internal: DisputeStatus mapping
// ---------------------------------------------------------------------------

const DISPUTE_STATUS_MAP: Record<string, DisputeStatus> = {
  Open:                  DisputeStatus.Open,
  ResolvedForBeneficiary: DisputeStatus.ResolvedForBeneficiary,
  ResolvedForDepositor:  DisputeStatus.ResolvedForDepositor,
};

function parseDisputeStatus(raw: string): DisputeStatus {
  const status = DISPUTE_STATUS_MAP[raw];
  if (!status) {
    throw new Error(
      `Unknown DisputeStatus value: "${raw}". Expected one of: ${Object.keys(DISPUTE_STATUS_MAP).join(', ')}`,
    );
  }
  return status;
}
