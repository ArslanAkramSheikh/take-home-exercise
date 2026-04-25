# Time-Off Microservice

A NestJS + SQLite microservice for managing employee time-off requests while treating the HCM as the source of truth for balances and employment-related time-off data.

## Problem Context

Employees request time off through the product-facing system, but the HCM remains the source of truth for balances. This creates synchronization challenges because:

- balances may change independently in HCM
- HCM may expose both realtime and batch interfaces
- approval flows must preserve balance integrity
- the system must be defensive even when HCM-side validation is not fully reliable

This implementation is designed around those constraints.

## Scope

This service supports:

- creating time-off requests
- approving and rejecting requests
- maintaining local balance snapshots
- defensive projected-balance checks
- syncing approved requests to HCM
- retrying failed approval syncs through an outbox pattern
- batch balance sync from HCM
- manual reconciliation of stale local snapshots

## Key Assumptions

- balances are maintained **per employee per location**
- HCM is the **source of truth**
- HCM exposes realtime APIs for validation and balance/application operations
- HCM may update balances independently outside this service
- SQLite is used as the local persistence layer for this take-home exercise

## Architecture Summary

### Main components

- **Time-Off Module**
  - manages request lifecycle
  - validates projected balance
  - handles approval/rejection flows

- **Balances Module**
  - stores local balance snapshots
  - recalculates reserved and projected balances
  - handles batch sync updates

- **Outbox Module**
  - retries failed HCM apply operations
  - preserves approval intent during temporary HCM failures

- **Mock HCM Module**
  - simulates HCM realtime and admin behavior for tests

- **Reconciliation Module**
  - optional manual/admin recovery path to refresh local snapshots from HCM

## Request Lifecycle

Typical flow:

1. employee creates a time-off request
2. service validates against HCM and local projected balance
3. request is stored as `PENDING_MANAGER_APPROVAL`
4. local balance is reserved
5. manager approves or rejects
6. if approval sync to HCM succeeds, request becomes `APPROVED_SYNCED`
7. if HCM apply temporarily fails, request becomes `APPROVED_SYNC_PENDING`
8. outbox retry later attempts to complete synchronization

## Main Endpoints

### Time-off requests
- `POST /time-off-requests`
- `GET /time-off-requests`
- `GET /time-off-requests/:id`
- `POST /time-off-requests/:id/approve`
- `POST /time-off-requests/:id/reject`

### Balances
- `GET /balances/:employeeId/:locationId`
- `POST /balances/batch-sync`

### Reconciliation
- `POST /reconciliation/run`

### Mock HCM
- `GET /mock-hcm/balances/:employeeId/:locationId`
- `POST /mock-hcm/validate`
- `POST /mock-hcm/apply`
- `POST /mock-hcm/admin/set-balance`
- `POST /mock-hcm/admin/failure-mode`

## Tech Stack

- NestJS
- TypeORM
- SQLite
- Jest
- Supertest

## Local Setup

### Prerequisites
- Node.js 20+
- npm

### Install dependencies
```bash
npm install 
