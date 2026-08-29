import { DisputeStatus, DisputeRecord } from "../types";

export function parseDisputeRecord(raw: RawDisputeRecord): DisputeRecord {
  return {
    // ...existing field mappings...
    status: raw.status as DisputeStatus,
  };
}