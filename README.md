# Time-Off Microservice

A NestJS + SQLite microservice for managing employee time-off requests while treating the HCM as the source of truth for balances and employment-related time-off data.

## Status

This implementation is fully runnable locally and currently has:

- 16/16 end-to-end tests passing
- 93.13% statement coverage
- 56.04% branch coverage
- 90.14% function coverage
- 93.36% line coverage

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

### Main Components

#### Time-Off Module
- manages request lifecycle
- validates projected balance
- handles approval and rejection flows

#### Balances Module
- stores local balance snapshots
- recalculates reserved and projected balances
- handles batch sync updates

#### Outbox Module
- retries failed HCM apply operations
- preserves approval intent during temporary HCM failures

#### Mock HCM Module
- simulates HCM realtime and admin behavior for tests

#### Reconciliation Module
- optional manual/admin recovery path to refresh local snapshots from HCM

## Request Lifecycle

Typical flow:

1. Employee creates a time-off request.
2. Service validates against HCM and local projected balance.
3. Request is stored as `PENDING_MANAGER_APPROVAL`.
4. Local balance is reserved.
5. Manager approves or rejects.
6. If approval sync to HCM succeeds, request becomes `APPROVED_SYNCED`.
7. If HCM apply temporarily fails, request becomes `APPROVED_SYNC_PENDING`.
8. Outbox retry later attempts to complete synchronization.

## Main Endpoints

### Time-Off Requests
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

### Install Dependencies
```bash
npm install
```

### Environment
Create a `.env` file in the project root.

You can either copy `.env.example` to `.env`, or create it manually.

#### Example `.env`
```env
PORT=3000
DB_PATH=data/timeoff.sqlite
HCM_BASE_URL=http://localhost:3000/mock-hcm
```

### Run the Service
```bash
npm run start:dev
```

## Testing

### Run End-to-End Tests
```bash
npm run test:e2e
```

### Run Coverage
```bash
npm run test:cov
```

## Verified Scenarios

The automated test suite currently covers:

- request creation and local reservation
- manager rejection and reservation release
- invalid date range rejection
- invalid combination of dimensions rejection
- HCM validation failure on create
- HCM unavailability on create
- successful approval and HCM sync
- invalid double-approval attempt
- retry after temporary HCM apply failure
- rejection during retry when HCM no longer accepts the request
- unsupported outbox job retry behavior
- defensive oversubscription rejection
- batch sync after independent HCM balance changes
- drift detection when batch balance drops below reserved balance
- idempotent request creation
- reconciliation of stale local balance snapshots

## Coverage

Current results:

- Tests: 16 / 16 passing
- Statements: 93.13%
- Branches: 56.04%
- Functions: 90.14%
- Lines: 93.36%

## Notes

### Source of Truth Model
The HCM remains the source of truth. This service uses local balance snapshots for fast reads, defensive checks, and request lifecycle integrity.

### Reconciliation
Realtime sync is the primary operational path. Reconciliation is an optional manual/admin recovery mechanism for refreshing stale local snapshots from HCM.

### Drift Flag
`balanceDriftDetected` currently represents a reservation safety condition where reserved balance exceeds the currently known balance. It does not represent all possible external mismatch scenarios.

## Deliverables

This repository is intended to accompany:

- the TRD
- the test suite
- coverage output
- the source code implementation

## Future Improvements

- add more branch-focused tests for deeper edge-case coverage
- add a separate snapshot mismatch flag distinct from reservation-risk drift
- introduce stronger observability and metrics around retry flows
- expand batch reconciliation and admin tooling
