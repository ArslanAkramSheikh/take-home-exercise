import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BalanceSnapshotEntity } from '../balances/balance-snapshot.entity';
import { HCM_CLIENT, HcmClient } from '../hcm/hcm.types';
import { BalancesService } from '../balances/balances.service';

@Injectable()
export class ReconciliationService {
  constructor(
    @InjectRepository(BalanceSnapshotEntity)
    private readonly balanceRepository: Repository<BalanceSnapshotEntity>,
    @Inject(HCM_CLIENT)
    private readonly hcmClient: HcmClient,
    private readonly balancesService: BalancesService,
  ) {}

  async runRealtimeReconciliation() {
    const snapshots = await this.balanceRepository.find();
    const results: Array<Record<string, unknown>> = [];

    for (const snapshot of snapshots) {
      const balance = await this.hcmClient.getBalance(
        snapshot.employeeId,
        snapshot.locationId,
      );
      const updated = await this.balancesService.upsertRealtimeSnapshot({
        employeeId: snapshot.employeeId,
        locationId: snapshot.locationId,
        hcmBalance: balance.balance,
      });
      results.push(this.balancesService.toResponse(updated));
    }

    return {
      reconciled: results.length,
      records: results,
    };
  }
}
