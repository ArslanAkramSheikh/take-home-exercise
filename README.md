```md
## Status
This implementation is fully runnable locally and currently has:
- 15/15 e2e tests passing
- 93.13% statement coverage
- 93.36% line coverage

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

## Environment

### Create a .env file:
PORT=3000
DB_PATH=data/timeoff.sqlite
HCM_BASE_URL=http://localhost:3000/mock-hcm

## Run the service
### Run the service by following command in the terminal
npm run start:dev

## Testing

### Run end-to-end tests
npm run test:e2e

### Run coverage
npm run test:cov

## Verified Scenarios

### The current automated test suite covers:
-Request creation and local reservation
-Manager rejection and reservation release
-Invalid date range rejection
-HCM validation failure on create
-HCM unavailability on create
-Successful approval and HCM sync
-Invalid double-approval attempt
-Retry after temporary HCM apply failure
-Rejection during retry when HCM no longer accepts the request
-Unsupported outbox job retry behavior
-Defensive oversubscription rejection
-Batch sync after independent HCM balance changes
-Drift detection when batch balance drops below reserved balance
-Idempotent request creation
-Reconciliation of stale local balance snapshots

## Coverage

### Current results:
-Tests: 15 / 15 passing
-Statements: 93.13%
-Branches: 56.04%
-Functions: 90.14%
-Lines: 93.36%

## Notes

### Source of truth model
The HCM remains the source of truth. This service uses local balance snapshots for fast reads, defensive checks, and request lifecycle integrity.

### Reconciliation
Realtime sync is the primary operational path. Reconciliation is an optional manual/admin recovery mechanism for refreshing stale local snapshots from HCM.

### Drift Flag
balanceDriftDetected currently represents a reservation safety condition where reserved balance exceeds the currently known balance. It does not represent all possible external mismatch scenarios.

## Deliverables

### This repository is intended to accompany:
-the TRD
-the test suite
-coverage output
-the source code implementation

## Future Improvements
-add more branch-focused tests for deeper edge-case coverage
-add a separate snapshot mismatch flag distinct from reservation-risk drift
-introduce stronger observability/metrics around retry flows
-expand batch reconciliation and admin tooling

