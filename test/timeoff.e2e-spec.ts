import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request = require("supertest");
import * as fs from "fs";
import * as path from "path";
import { AppModule } from "../src/app.module";
import { OutboxService } from "../src/outbox/outbox.service";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  OutboxJobEntity,
  OutboxJobStatus,
} from "../src/outbox/outbox-job.entity";

describe("Time-off microservice (e2e)", () => {
  let app: INestApplication;
  let serverUrl: string;
  let outboxService: OutboxService;
  let outboxRepository: Repository<OutboxJobEntity>;
  const port = 3101;
  const dbPath = path.join(process.cwd(), "test-e2e.sqlite");

  beforeAll(async () => {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }

    process.env.DB_PATH = dbPath;
    process.env.PORT = String(port);
    process.env.HCM_BASE_URL = `http://127.0.0.1:${port}/mock-hcm`;

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen(port);

    outboxService = app.get(OutboxService);
    outboxRepository = app.get(getRepositoryToken(OutboxJobEntity));
    serverUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  const resetFailureMode = async () => {
    await request(serverUrl)
      .post("/mock-hcm/admin/failure-mode")
      .send({
        failValidation: false,
        failApply: false,
        unavailable: false,
      })
      .expect(201);
  };

  it("creates a request and reserves local balance", async () => {
    await request(serverUrl)
      .post("/mock-hcm/admin/set-balance")
      .send({ employeeId: "emp-a", locationId: "loc-a", balance: 10 })
      .expect(201);

    const create = await request(serverUrl)
      .post("/time-off-requests")
      .send({
        employeeId: "emp-a",
        locationId: "loc-a",
        startDate: "2026-05-01",
        endDate: "2026-05-02",
        days: 2,
        idempotencyKey: "req-create-1",
      })
      .expect(201);

    expect(create.body.status).toBe("PENDING_MANAGER_APPROVAL");

    const balance = await request(serverUrl)
      .get("/balances/emp-a/loc-a")
      .expect(200);

    expect(balance.body.hcmBalance).toBe(10);
    expect(balance.body.reservedBalance).toBe(2);
    expect(balance.body.projectedAvailableBalance).toBe(8);
  });

  it("rejects a request and releases local reservation", async () => {
    await request(serverUrl)
      .post("/mock-hcm/admin/set-balance")
      .send({ employeeId: "emp-f", locationId: "loc-a", balance: 8 })
      .expect(201);

    const create = await request(serverUrl)
      .post("/time-off-requests")
      .send({
        employeeId: "emp-f",
        locationId: "loc-a",
        startDate: "2026-05-10",
        endDate: "2026-05-11",
        days: 3,
        idempotencyKey: "req-reject-1",
      })
      .expect(201);

    const rejected = await request(serverUrl)
      .post(`/time-off-requests/${create.body.id}/reject`)
      .send({ managerId: "mgr-reject", reason: "manager rejected" })
      .expect(201);

    expect(rejected.body.status).toBe("REJECTED");

    const balance = await request(serverUrl)
      .get("/balances/emp-f/loc-a")
      .expect(200);

    expect(balance.body.hcmBalance).toBe(8);
    expect(balance.body.reservedBalance).toBe(0);
    expect(balance.body.projectedAvailableBalance).toBe(8);
  });

  it("rejects invalid date ranges", async () => {
    await request(serverUrl)
      .post("/mock-hcm/admin/set-balance")
      .send({ employeeId: "emp-date", locationId: "loc-a", balance: 10 })
      .expect(201);

    const response = await request(serverUrl)
      .post("/time-off-requests")
      .send({
        employeeId: "emp-date",
        locationId: "loc-a",
        startDate: "2026-05-20",
        endDate: "2026-05-10",
        days: 1,
        idempotencyKey: "req-invalid-dates-1",
      })
      .expect(400);

    expect(String(response.body.message)).toContain("startDate");
  });

  it("rejects request creation when HCM validation fails", async () => {
    await resetFailureMode();

    await request(serverUrl)
      .post("/mock-hcm/admin/failure-mode")
      .send({ failValidation: true })
      .expect(201);

    const response = await request(serverUrl)
      .post("/time-off-requests")
      .send({
        employeeId: "emp-val",
        locationId: "loc-a",
        startDate: "2026-05-15",
        endDate: "2026-05-15",
        days: 1,
        idempotencyKey: "req-validation-fail-1",
      })
      .expect(400);

    expect(String(response.body.message)).toContain("HCM");

    await resetFailureMode();
  });

  it("rejects request creation when HCM is unavailable", async () => {
    await resetFailureMode();

    await request(serverUrl)
      .post("/mock-hcm/admin/failure-mode")
      .send({ unavailable: true })
      .expect(201);

    await request(serverUrl)
      .post("/time-off-requests")
      .send({
        employeeId: "emp-unavail",
        locationId: "loc-a",
        startDate: "2026-05-16",
        endDate: "2026-05-16",
        days: 1,
        idempotencyKey: "req-unavailable-1",
      })
      .expect(503);

    await resetFailureMode();
  });

  it("approves a request and syncs the HCM balance", async () => {
    await request(serverUrl)
      .post("/mock-hcm/admin/set-balance")
      .send({ employeeId: "emp-b", locationId: "loc-a", balance: 10 })
      .expect(201);

    const create = await request(serverUrl)
      .post("/time-off-requests")
      .send({
        employeeId: "emp-b",
        locationId: "loc-a",
        startDate: "2026-06-01",
        endDate: "2026-06-01",
        days: 3,
        idempotencyKey: "req-approve-1",
      })
      .expect(201);

    const approve = await request(serverUrl)
      .post(`/time-off-requests/${create.body.id}/approve`)
      .send({ managerId: "mgr-1" })
      .expect(201);

    expect(approve.body.status).toBe("APPROVED_SYNCED");

    const balance = await request(serverUrl)
      .get("/balances/emp-b/loc-a")
      .expect(200);

    expect(balance.body.hcmBalance).toBe(7);
    expect(balance.body.reservedBalance).toBe(0);
  });

  it("prevents approving a request that is already approved", async () => {
    await request(serverUrl)
      .post("/mock-hcm/admin/set-balance")
      .send({ employeeId: "emp-g", locationId: "loc-a", balance: 10 })
      .expect(201);

    const create = await request(serverUrl)
      .post("/time-off-requests")
      .send({
        employeeId: "emp-g",
        locationId: "loc-a",
        startDate: "2026-06-15",
        endDate: "2026-06-15",
        days: 1,
        idempotencyKey: "req-double-approve-1",
      })
      .expect(201);

    await request(serverUrl)
      .post(`/time-off-requests/${create.body.id}/approve`)
      .send({ managerId: "mgr-approve" })
      .expect(201);

    const secondApprove = await request(serverUrl)
      .post(`/time-off-requests/${create.body.id}/approve`)
      .send({ managerId: "mgr-approve" })
      .expect(409);

    expect(String(secondApprove.body.message)).toContain("Cannot approve");
  });

  it("queues retry when HCM apply is unavailable and later succeeds", async () => {
    await request(serverUrl)
      .post("/mock-hcm/admin/set-balance")
      .send({ employeeId: "emp-c", locationId: "loc-a", balance: 5 })
      .expect(201);

    const create = await request(serverUrl)
      .post("/time-off-requests")
      .send({
        employeeId: "emp-c",
        locationId: "loc-a",
        startDate: "2026-07-01",
        endDate: "2026-07-01",
        days: 2,
        idempotencyKey: "req-retry-1",
      })
      .expect(201);

    await request(serverUrl)
      .post("/mock-hcm/admin/failure-mode")
      .send({ failApply: true })
      .expect(201);

    const approve = await request(serverUrl)
      .post(`/time-off-requests/${create.body.id}/approve`)
      .send({ managerId: "mgr-2" })
      .expect(201);

    expect(approve.body.status).toBe("APPROVED_SYNC_PENDING");

    await request(serverUrl)
      .post("/mock-hcm/admin/failure-mode")
      .send({ failApply: false })
      .expect(201);

    await outboxService.processPendingJobs();

    const refreshed = await request(serverUrl)
      .get(`/time-off-requests/${create.body.id}`)
      .expect(200);

    expect(refreshed.body.status).toBe("APPROVED_SYNCED");
  });

  it("rejects pending-sync requests on retry when HCM no longer accepts them", async () => {
    await resetFailureMode();

    await request(serverUrl)
      .post("/mock-hcm/admin/set-balance")
      .send({ employeeId: "emp-h", locationId: "loc-a", balance: 5 })
      .expect(201);

    const create = await request(serverUrl)
      .post("/time-off-requests")
      .send({
        employeeId: "emp-h",
        locationId: "loc-a",
        startDate: "2026-07-10",
        endDate: "2026-07-10",
        days: 4,
        idempotencyKey: "req-retry-reject-1",
      })
      .expect(201);

    await request(serverUrl)
      .post("/mock-hcm/admin/failure-mode")
      .send({ failApply: true })
      .expect(201);

    await request(serverUrl)
      .post(`/time-off-requests/${create.body.id}/approve`)
      .send({ managerId: "mgr-retry-reject" })
      .expect(201);

    await request(serverUrl)
      .post("/mock-hcm/admin/failure-mode")
      .send({ failApply: false })
      .expect(201);

    await request(serverUrl)
      .post("/mock-hcm/admin/set-balance")
      .send({ employeeId: "emp-h", locationId: "loc-a", balance: 1 })
      .expect(201);

    await outboxService.processPendingJobs();

    const after = await request(serverUrl)
      .get(`/time-off-requests/${create.body.id}`)
      .expect(200);

    expect(after.body.status).toBe("REJECTED");

    const balance = await request(serverUrl)
      .get("/balances/emp-h/loc-a")
      .expect(200);

    expect(balance.body.reservedBalance).toBe(0);

    await resetFailureMode();
  });

  it('requeues unsupported outbox job types through generic retry handling', async () => {
  const job = await outboxRepository.save(
    outboxRepository.create({
      type: 'BAD_JOB_TYPE',
      payload: { anything: 'x' },
      status: OutboxJobStatus.PENDING,
      attempts: 0,
      nextRunAt: new Date(Date.now() - 60_000),
    }),
  );

  await outboxService.processJob(job);

  const updated = await outboxRepository.findOne({
    where: { id: job.id },
  });

  expect(updated).toBeTruthy();
  expect(updated!.status).toBe(OutboxJobStatus.PENDING);
  expect(updated!.attempts).toBe(1);
  expect(String(updated!.lastError)).toContain('Unsupported job type');
});

  it("defensively rejects oversubscription even if HCM has not seen local reservations yet", async () => {
    await request(serverUrl)
      .post("/mock-hcm/admin/set-balance")
      .send({ employeeId: "emp-d", locationId: "loc-a", balance: 10 })
      .expect(201);

    await request(serverUrl)
      .post("/time-off-requests")
      .send({
        employeeId: "emp-d",
        locationId: "loc-a",
        startDate: "2026-08-01",
        endDate: "2026-08-03",
        days: 9,
        idempotencyKey: "req-oversub-1",
      })
      .expect(201);

    const second = await request(serverUrl)
      .post("/time-off-requests")
      .send({
        employeeId: "emp-d",
        locationId: "loc-a",
        startDate: "2026-08-10",
        endDate: "2026-08-10",
        days: 2,
        idempotencyKey: "req-oversub-2",
      })
      .expect(409);

    expect(second.body.message).toContain("Insufficient projected balance");
  });

  it("accepts batch sync updates when HCM balance changes independently", async () => {
    await request(serverUrl)
      .post("/balances/batch-sync")
      .send({
        records: [
          {
            employeeId: "emp-a",
            locationId: "loc-a",
            hcmBalance: 12,
          },
        ],
      })
      .expect(201);

    const balance = await request(serverUrl)
      .get("/balances/emp-a/loc-a")
      .expect(200);

    expect(balance.body.hcmBalance).toBe(12);
  });

  it("flags drift when batch sync balance is lower than reserved balance", async () => {
    await request(serverUrl)
      .post("/mock-hcm/admin/set-balance")
      .send({ employeeId: "emp-drift", locationId: "loc-a", balance: 10 })
      .expect(201);

    await request(serverUrl)
      .post("/time-off-requests")
      .send({
        employeeId: "emp-drift",
        locationId: "loc-a",
        startDate: "2026-08-20",
        endDate: "2026-08-23",
        days: 4,
        idempotencyKey: "req-drift-1",
      })
      .expect(201);

    await request(serverUrl)
      .post("/balances/batch-sync")
      .send({
        records: [
          {
            employeeId: "emp-drift",
            locationId: "loc-a",
            hcmBalance: 2,
          },
        ],
      })
      .expect(201);

    const balance = await request(serverUrl)
      .get("/balances/emp-drift/loc-a")
      .expect(200);

    expect(balance.body.hcmBalance).toBe(2);
    expect(balance.body.reservedBalance).toBe(4);
    expect(balance.body.balanceDriftDetected).toBe(true);
  });

  it("returns the same request for the same idempotency key", async () => {
    await request(serverUrl)
      .post("/mock-hcm/admin/set-balance")
      .send({ employeeId: "emp-e", locationId: "loc-a", balance: 10 })
      .expect(201);

    const payload = {
      employeeId: "emp-e",
      locationId: "loc-a",
      startDate: "2026-09-01",
      endDate: "2026-09-01",
      days: 1,
      idempotencyKey: "req-idempotent-1",
    };

    const first = await request(serverUrl)
      .post("/time-off-requests")
      .send(payload)
      .expect(201);

    const second = await request(serverUrl)
      .post("/time-off-requests")
      .send(payload)
      .expect(201);

    expect(second.body.id).toBe(first.body.id);
  });

  it("reconciles stale local balance snapshots with HCM", async () => {
    await request(serverUrl)
      .post("/mock-hcm/admin/set-balance")
      .send({ employeeId: "emp-r", locationId: "loc-a", balance: 10 })
      .expect(201);

    const createResponse = await request(serverUrl)
      .post("/time-off-requests")
      .send({
        employeeId: "emp-r",
        locationId: "loc-a",
        startDate: "2026-07-01",
        endDate: "2026-07-01",
        days: 1,
        idempotencyKey: "reconcile-seed-1",
      })
      .expect(201);

    await request(serverUrl)
      .post(`/time-off-requests/${createResponse.body.id}/reject`)
      .send({ managerId: "mgr-1", reason: "cleanup for reconciliation test" })
      .expect(201);

    const before = await request(serverUrl)
      .get("/balances/emp-r/loc-a")
      .expect(200);

    expect(before.body.hcmBalance).toBe(10);

    await request(serverUrl)
      .post("/mock-hcm/admin/set-balance")
      .send({ employeeId: "emp-r", locationId: "loc-a", balance: 12 })
      .expect(201);

    const hcmNow = await request(serverUrl)
      .get("/mock-hcm/balances/emp-r/loc-a")
      .expect(200);

    expect(hcmNow.body.balance).toBe(12);

    const reconciliation = await request(serverUrl)
      .post("/reconciliation/run")
      .send({})
      .expect(201);

    expect(reconciliation.body.reconciled).toBeGreaterThan(0);

    const after = await request(serverUrl)
      .get("/balances/emp-r/loc-a")
      .expect(200);

    expect(after.body.hcmBalance).toBe(12);
    expect(after.body.reservedBalance).toBe(0);
    expect(after.body.projectedAvailableBalance).toBe(12);
    expect(after.body.lastSyncSource).toBe("REALTIME");
  });
});
