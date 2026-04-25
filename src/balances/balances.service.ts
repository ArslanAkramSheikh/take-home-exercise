import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BalanceSnapshotEntity } from './balance-snapshot.entity';
import { BalanceBatchSyncDto } from './dto/upsert-balance-batch.dto';
import { TimeOffRequestEntity } from '../time-off/time-off-request.entity';
import { RESERVING_STATUSES } from '../common/enums/request-status.enum';

type SyncSource = 'REALTIME' | 'BATCH' | 'OUTBOX_RETRY';

@Injectable()
export class BalancesService {
  constructor(
    @InjectRepository(BalanceSnapshotEntity)
    private readonly balanceRepository: Repository<BalanceSnapshotEntity>,
    @InjectRepository(TimeOffRequestEntity)
    private readonly requestRepository: Repository<TimeOffRequestEntity>,
  ) {}

  async getBalance(employeeId: string, locationId: string) {
    const snapshot = await this.balanceRepository.findOne({
      where: { employeeId, locationId },
    });

    if (!snapshot) {
      throw new NotFoundException('Balance snapshot not found');
    }

    return this.toResponse(snapshot);
  }

  async batchSync(dto: BalanceBatchSyncDto) {
    const results: Array<Record<string, unknown>> = [];

    for (const record of dto.records) {
      const snapshot = await this.recalculateSnapshot({
        employeeId: record.employeeId,
        locationId: record.locationId,
        hcmBalance: record.hcmBalance,
        syncSource: 'BATCH',
        batchSyncedAt: record.effectiveAt
          ? new Date(record.effectiveAt)
          : new Date(),
      });

      results.push(this.toResponse(snapshot));
    }

    return {
      synced: results.length,
      records: results,
    };
  }

  async upsertRealtimeSnapshot(input: {
    employeeId: string;
    locationId: string;
    hcmBalance: number;
  }): Promise<BalanceSnapshotEntity> {
    return this.recalculateSnapshot({
      employeeId: input.employeeId,
      locationId: input.locationId,
      hcmBalance: input.hcmBalance,
      syncSource: 'REALTIME',
      checkedAt: new Date(),
    });
  }

  async recalculateSnapshot(input: {
    employeeId: string;
    locationId: string;
    hcmBalance: number;
    syncSource: SyncSource;
    checkedAt?: Date;
    batchSyncedAt?: Date;
  }): Promise<BalanceSnapshotEntity> {
    const reserved = await this.computeReservedBalance(
      input.employeeId,
      input.locationId,
    );

    const snapshot = await this.getOrCreateSnapshot(
      input.employeeId,
      input.locationId,
    );

    snapshot.hcmBalance = input.hcmBalance;
    snapshot.reservedBalance = reserved;
    snapshot.balanceDriftDetected = snapshot.hcmBalance < snapshot.reservedBalance;
    snapshot.lastSyncSource = input.syncSource;

    if (input.syncSource === 'REALTIME' && input.checkedAt) {
      snapshot.lastRealtimeCheckedAt = input.checkedAt;
    }

    if (input.syncSource === 'BATCH' && input.batchSyncedAt) {
      snapshot.lastBatchSyncedAt = input.batchSyncedAt;
    }

    if (input.syncSource === 'OUTBOX_RETRY' && input.checkedAt) {
      snapshot.lastRealtimeCheckedAt = input.checkedAt;
    }

    return this.balanceRepository.save(snapshot);
  }

  async computeReservedBalance(
    employeeId: string,
    locationId: string,
  ): Promise<number> {
    const raw = await this.requestRepository
      .createQueryBuilder('request')
      .select('COALESCE(SUM(request.days), 0)', 'reserved')
      .where('request.employeeId = :employeeId', { employeeId })
      .andWhere('request.locationId = :locationId', { locationId })
      .andWhere('request.status IN (:...statuses)', {
        statuses: RESERVING_STATUSES,
      })
      .getRawOne<{ reserved: number | string }>();

    return Number(raw?.reserved ?? 0);
  }

  private async getOrCreateSnapshot(
    employeeId: string,
    locationId: string,
  ): Promise<BalanceSnapshotEntity> {
    let snapshot = await this.balanceRepository.findOne({
      where: { employeeId, locationId },
    });

    if (!snapshot) {
      snapshot = this.balanceRepository.create({
        employeeId,
        locationId,
      });
    }

    return snapshot;
  }

  toResponse(snapshot: BalanceSnapshotEntity) {
    return {
      employeeId: snapshot.employeeId,
      locationId: snapshot.locationId,
      hcmBalance: snapshot.hcmBalance,
      reservedBalance: snapshot.reservedBalance,
      projectedAvailableBalance: snapshot.projectedAvailableBalance,
      balanceDriftDetected: snapshot.balanceDriftDetected,
      lastRealtimeCheckedAt: snapshot.lastRealtimeCheckedAt,
      lastBatchSyncedAt: snapshot.lastBatchSyncedAt,
      lastSyncSource: snapshot.lastSyncSource,
      updatedAt: snapshot.updatedAt,
    };
  }
}