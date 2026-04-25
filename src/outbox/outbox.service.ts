import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { OutboxJobEntity, OutboxJobStatus } from './outbox-job.entity';
import { TimeOffRequestEntity } from '../time-off/time-off-request.entity';
import { BalanceSnapshotEntity } from '../balances/balance-snapshot.entity';
import { TimeOffRequestStatus } from '../common/enums/request-status.enum';
import { HCM_CLIENT, HcmClient } from '../hcm/hcm.types';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    @InjectRepository(OutboxJobEntity)
    private readonly outboxRepository: Repository<OutboxJobEntity>,
    @Inject(HCM_CLIENT)
    private readonly hcmClient: HcmClient,
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processPendingJobs() {
    const jobs = await this.outboxRepository.find({
      where: { status: OutboxJobStatus.PENDING },
      order: { nextRunAt: "ASC", createdAt: "ASC" },
      take: 10,
    });

    const now = new Date();
    for (const job of jobs) {
      if (job.nextRunAt > now) continue;
      await this.processJob(job);
    }
  }

  async processJob(job: OutboxJobEntity) {
    job.status = OutboxJobStatus.PROCESSING;
    await this.outboxRepository.save(job);

    try {
      if (job.type !== "APPLY_TIME_OFF") {
        throw new Error(`Unsupported job type: ${job.type}`);
      }

      const requestId = String(job.payload.requestId);
      const result = await this.entityManager.transaction(async (manager: EntityManager) => {
        const requestRepository = manager.getRepository(TimeOffRequestEntity);
        const balanceRepository = manager.getRepository(BalanceSnapshotEntity);

        const request = await requestRepository.findOne({
          where: { id: requestId },
        });
        if (
          !request ||
          request.status !== TimeOffRequestStatus.APPROVED_SYNC_PENDING
        ) {
          return "SKIP";
        }

        const hcmResult = await this.hcmClient.applyTimeOff({
          employeeId: request.employeeId,
          locationId: request.locationId,
          days: request.days,
          requestId: request.id,
        });

        if (!hcmResult.accepted) {
          request.status = TimeOffRequestStatus.REJECTED;
          request.rejectionReason = hcmResult.reason ?? "HCM rejected on retry";
          await requestRepository.save(request);

          const snapshot = await balanceRepository.findOneByOrFail({
            employeeId: request.employeeId,
            locationId: request.locationId,
          });
          snapshot.reservedBalance = Math.max(
            0,
            snapshot.reservedBalance - request.days,
          );
          snapshot.balanceDriftDetected =
            snapshot.hcmBalance < snapshot.reservedBalance;
          await balanceRepository.save(snapshot);

          return "REJECTED";
        }

        request.status = TimeOffRequestStatus.APPROVED_SYNCED;
        request.hcmReference = hcmResult.hcmReference ?? null;
        request.hcmSyncedAt = new Date();
        await requestRepository.save(request);

        const snapshot = await balanceRepository.findOneByOrFail({
          employeeId: request.employeeId,
          locationId: request.locationId,
        });
        snapshot.reservedBalance = Math.max(
          0,
          snapshot.reservedBalance - request.days,
        );
        snapshot.hcmBalance =
          typeof hcmResult.remainingBalance === "number"
            ? hcmResult.remainingBalance
            : snapshot.hcmBalance - request.days;
        snapshot.lastRealtimeCheckedAt = new Date();
        snapshot.lastSyncSource = "OUTBOX_RETRY";
        snapshot.balanceDriftDetected =
          snapshot.hcmBalance < snapshot.reservedBalance;
        await balanceRepository.save(snapshot);

        return "SYNCED";
      });

      job.status = OutboxJobStatus.SUCCEEDED;
      job.lastError = result;
      await this.outboxRepository.save(job);
    } catch (error) {
      job.status =
        job.attempts >= 5 ? OutboxJobStatus.FAILED : OutboxJobStatus.PENDING;
      job.attempts += 1;
      job.lastError =
        error instanceof Error ? error.message : "Unknown retry error";
      const next = new Date();
      next.setMinutes(next.getMinutes() + Math.max(1, job.attempts));
      job.nextRunAt = next;
      await this.outboxRepository.save(job);
      this.logger.warn(`Retry failed for job ${job.id}: ${job.lastError}`);
    }
  }
}
