import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxJobEntity } from './outbox-job.entity';
import { OutboxService } from './outbox.service';
import { HcmModule } from '../hcm/hcm.module';
import { TimeOffRequestEntity } from '../time-off/time-off-request.entity';
import { BalanceSnapshotEntity } from '../balances/balance-snapshot.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OutboxJobEntity,
      TimeOffRequestEntity,
      BalanceSnapshotEntity,
    ]),
    HcmModule,
  ],
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}
