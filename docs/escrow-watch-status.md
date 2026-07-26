# Escrow Watch Status Guide

This document describes the `watchEscrowStatus()` typed event emitter provided by the SDK to subscribe to escrow lifecycle events.

## Architecture

1. **Escrow Events Service**:
   - `src/modules/escrow/escrow-events.service.ts`: Extends Node's `EventEmitter` to provide polling mechanisms for observing state changes.

2. **Validation Schemas & Interfaces**:
   - `escrowEventPayloadSchema` and `EscrowEventPayload` defined in `src/modules/escrow/escrow-events.schemas.ts`.

3. **Testing**:
   - Covered in `tests/modules/escrow/escrow-events.service.spec.ts`.
