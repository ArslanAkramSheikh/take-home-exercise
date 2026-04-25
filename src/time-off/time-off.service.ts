import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { TimeOffRequestEntity } from './time-off-request.entity';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';
import { BalanceSnapshotEntity } from '../balances/balance-snapshot.entity';
import {
  RESERVING_STATUSES,
  TimeOffRequestStatus,
} from '../common/enums/request-status.enum';
import { HCM_CLIENT, HcmClient } from '../hcm/hcm.types';
import { BalancesService } from '../balances/balances.service';
import { OutboxJobEntity, OutboxJobStatus } from '../outbox/outbox-job.entity';

@Injectable()
export class TimeOffService {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    @InjectRepository(TimeOffRequestEntity)
    private readonly requestRepository: Repository<TimeOffRequestEntity>,
    @InjectRepository(OutboxJobEntity)
    private readonly outboxRepository: Repository<OutboxJobEntity>,
    @Inject(HCM_CLIENT)
    private readonly hcmClient: HcmClient,
    private readonly balancesService: BalancesService,
  ) {}

  async createRequest(dto: CreateTimeOffRequestDto) {
    if (dto.startDate > dto.endDate) {
      throw new BadRequestException(
        'startDate must be before or equal to endDate',
      );
    }

    const idempotencyKey = dto.idempotencyKey?.trim() || randomUUID();
    const existing = await this.requestRepository.findOne({
      where: { idempotencyKey },
    });
    if (existing) {
      return this.toResponse(existing);
    }

    const validation = await this.hcmClient.validateRequest(
      dto.employeeId,
      dto.locationId,
      dto.days,
    );

    if (!validation.valid) {
      throw new BadRequestException(
        validation.reason ?? 'HCM rejected request',
      );
    }

    const realtimeBalance = await this.hcmClient.getBalance(
      dto.employeeId,
      dto.locationId,
    );

    await this.balancesService.upsertRealtimeSnapshot({
      employeeId: dto.employeeId,
      locationId: dto.locationId,
      hcmBalance: realtimeBalance.balance,
    });

    const request = await this.entityManager.transaction(
      async (manager: EntityManager) => {
        const balanceRepository = manager.getRepository(BalanceSnapshotEntity);
        const requestRepository = manager.getRepository(TimeOffRequestEntity);

        let snapshot = await balanceRepository.findOne({
          where: {
            employeeId: dto.employeeId,
            locationId: dto.locationId,
          },
        });

        if (!snapshot) {
          snapshot = balanceRepository.create({
            employeeId: dto.employeeId,
            locationId: dto.locationId,
            hcmBalance: realtimeBalance.balance,
            reservedBalance: 0,
            lastRealtimeCheckedAt: new Date(realtimeBalance.checkedAt),
            lastSyncSource: 'REALTIME',
          });
        }

        if (snapshot.projectedAvailableBalance < dto.days) {
          throw new ConflictException('Insufficient projected balance');
        }

        snapshot.reservedBalance = Number(
          (snapshot.reservedBalance + dto.days).toFixed(2),
        );
        snapshot.balanceDriftDetected =
          snapshot.hcmBalance < snapshot.reservedBalance;
        await balanceRepository.save(snapshot);

        const entity = requestRepository.create({
          employeeId: dto.employeeId,
          locationId: dto.locationId,
          startDate: dto.startDate,
          endDate: dto.endDate,
          days: dto.days,
          status: TimeOffRequestStatus.PENDING_MANAGER_APPROVAL,
          idempotencyKey,
        });

        return requestRepository.save(entity);
      },
    );

    return this.toResponse(request);
  }

  async approveRequest(id: string, managerId: string) {
    const request = await this.getRequestOrThrow(this.requestRepository, id);

    if (
      ![
        TimeOffRequestStatus.PENDING_MANAGER_APPROVAL,
        TimeOffRequestStatus.APPROVED_SYNC_PENDING,
      ].includes(request.status)
    ) {
      throw new ConflictException(
        `Cannot approve request in status ${request.status}`,
      );
    }

    try {
      const result = await this.hcmClient.applyTimeOff({
        employeeId: request.employeeId,
        locationId: request.locationId,
        days: request.days,
        requestId: request.id,
      });

      if (!result.accepted) {
        await this.entityManager.transaction(async (manager: EntityManager) => {
          const requestRepository = manager.getRepository(TimeOffRequestEntity);
          const balanceRepository = manager.getRepository(
            BalanceSnapshotEntity,
          );

          const currentRequest = await this.getRequestOrThrow(
            requestRepository,
            request.id,
          );

          this.markRejected(
            currentRequest,
            managerId,
            result.reason ?? 'HCM rejected approval',
          );
          await requestRepository.save(currentRequest);

          await this.updateSnapshotAfterReservationRelease(
            balanceRepository,
            currentRequest,
            {
              remainingBalance: result.remainingBalance,
            },
          );
        });

        throw new ConflictException(result.reason ?? 'HCM rejected request');
      }

      const updated = await this.entityManager.transaction(
        async (manager: EntityManager) => {
          const requestRepository = manager.getRepository(TimeOffRequestEntity);
          const balanceRepository = manager.getRepository(
            BalanceSnapshotEntity,
          );

          const currentRequest = await this.getRequestOrThrow(
            requestRepository,
            request.id,
          );

          this.markApprovedSynced(
            currentRequest,
            managerId,
            result.hcmReference ?? null,
          );
          await requestRepository.save(currentRequest);

          await this.updateSnapshotAfterReservationRelease(
            balanceRepository,
            currentRequest,
            {
              remainingBalance: result.remainingBalance,
              decrementHcmByRequestDays: true,
              syncSource: 'REALTIME',
              checkedAt: new Date(),
            },
          );

          return currentRequest;
        },
      );

      return this.toResponse(updated);
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) {
        throw error;
      }

      const updated = await this.entityManager.transaction(
        async (manager: EntityManager) => {
          const requestRepository = manager.getRepository(TimeOffRequestEntity);
          const outboxRepository = manager.getRepository(OutboxJobEntity);

          const currentRequest = await this.getRequestOrThrow(
            requestRepository,
            request.id,
          );

          this.markApprovedSyncPending(currentRequest, managerId);
          await requestRepository.save(currentRequest);

          await this.enqueueApprovalRetry(outboxRepository, currentRequest.id);

          return currentRequest;
        },
      );

      return {
        ...this.toResponse(updated),
        note: 'HCM apply failed, approval queued for retry',
      };
    }
  }

  async rejectRequest(id: string, managerId: string, reason?: string) {
    const request = await this.getRequestOrThrow(this.requestRepository, id);

    if (!RESERVING_STATUSES.includes(request.status)) {
      throw new ConflictException(
        `Cannot reject request in status ${request.status}`,
      );
    }

    const updated = await this.entityManager.transaction(
      async (manager: EntityManager) => {
        const requestRepository = manager.getRepository(TimeOffRequestEntity);
        const balanceRepository = manager.getRepository(BalanceSnapshotEntity);

        const currentRequest = await this.getRequestOrThrow(
          requestRepository,
          request.id,
        );

        this.markRejected(
          currentRequest,
          managerId,
          reason ?? 'Rejected by manager',
        );
        await requestRepository.save(currentRequest);

        await this.updateSnapshotAfterReservationRelease(
          balanceRepository,
          currentRequest,
        );

        return currentRequest;
      },
    );

    return this.toResponse(updated);
  }

  async findOne(id: string) {
    const request = await this.requestRepository.findOne({ where: { id } });
    if (!request) throw new NotFoundException('Time-off request not found');
    return this.toResponse(request);
  }

  async list(filters: {
    employeeId?: string;
    locationId?: string;
    status?: TimeOffRequestStatus;
  }) {
    const where = {
      ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
      ...(filters.locationId ? { locationId: filters.locationId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    };

    const requests = await this.requestRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });

    return requests.map((request) => this.toResponse(request));
  }

  private async getRequestOrThrow(
    requestRepository: Repository<TimeOffRequestEntity>,
    id: string,
  ): Promise<TimeOffRequestEntity> {
    const request = await requestRepository.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException('Time-off request not found');
    }
    return request;
  }

  private markRejected(
    request: TimeOffRequestEntity,
    managerId: string,
    reason: string,
  ) {
    request.status = TimeOffRequestStatus.REJECTED;
    request.managerId = managerId;
    request.rejectionReason = reason;
  }

  private markApprovedSynced(
    request: TimeOffRequestEntity,
    managerId: string,
    hcmReference?: string | null,
  ) {
    request.status = TimeOffRequestStatus.APPROVED_SYNCED;
    request.managerId = managerId;
    request.hcmReference = hcmReference ?? null;
    request.hcmSyncedAt = new Date();
  }

  private markApprovedSyncPending(
    request: TimeOffRequestEntity,
    managerId: string,
  ) {
    request.status = TimeOffRequestStatus.APPROVED_SYNC_PENDING;
    request.managerId = managerId;
  }

  private async updateSnapshotAfterReservationRelease(
    balanceRepository: Repository<BalanceSnapshotEntity>,
    request: TimeOffRequestEntity,
    options?: {
      remainingBalance?: number;
      decrementHcmByRequestDays?: boolean;
      syncSource?: 'REALTIME' | 'OUTBOX_RETRY';
      checkedAt?: Date;
    },
  ) {
    const snapshot = await balanceRepository.findOneByOrFail({
      employeeId: request.employeeId,
      locationId: request.locationId,
    });

    snapshot.reservedBalance = Math.max(
      0,
      Number((snapshot.reservedBalance - request.days).toFixed(2)),
    );

    if (typeof options?.remainingBalance === 'number') {
      snapshot.hcmBalance = options.remainingBalance;
    } else if (options?.decrementHcmByRequestDays) {
      snapshot.hcmBalance = Number(
        (snapshot.hcmBalance - request.days).toFixed(2),
      );
    }

    if (options?.syncSource) {
      snapshot.lastSyncSource = options.syncSource;
    }

    if (options?.checkedAt) {
      snapshot.lastRealtimeCheckedAt = options.checkedAt;
    }

    snapshot.balanceDriftDetected =
      snapshot.hcmBalance < snapshot.reservedBalance;

    await balanceRepository.save(snapshot);
  }

  private async enqueueApprovalRetry(
    outboxRepository: Repository<OutboxJobEntity>,
    requestId: string,
  ) {
    const existingJob = await outboxRepository
      .createQueryBuilder('job')
      .where('job.type = :type', { type: 'APPLY_TIME_OFF' })
      .andWhere('job.status IN (:...statuses)', {
        statuses: [OutboxJobStatus.PENDING, OutboxJobStatus.PROCESSING],
      })
      .andWhere(`json_extract(job.payload, '$.requestId') = :requestId`, {
        requestId,
      })
      .getOne();

    if (existingJob) {
      return existingJob;
    }

    const job = outboxRepository.create({
      type: 'APPLY_TIME_OFF',
      payload: { requestId },
      nextRunAt: new Date(),
    });

    return outboxRepository.save(job);
  }

  private toResponse(entity: TimeOffRequestEntity) {
    return {
      id: entity.id,
      employeeId: entity.employeeId,
      locationId: entity.locationId,
      startDate: entity.startDate,
      endDate: entity.endDate,
      days: entity.days,
      status: entity.status,
      managerId: entity.managerId,
      rejectionReason: entity.rejectionReason,
      hcmReference: entity.hcmReference,
      hcmSyncedAt: entity.hcmSyncedAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}