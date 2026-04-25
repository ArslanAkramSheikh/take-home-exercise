import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimeOffRequestEntity } from './time-off-request.entity';
import { TimeOffController } from './time-off.controller';
import { TimeOffService } from './time-off.service';
import { BalanceSnapshotEntity } from '../balances/balance-snapshot.entity';
import { OutboxJobEntity } from '../outbox/outbox-job.entity';
import { HcmModule } from '../hcm/hcm.module';
import { BalancesModule } from '../balances/balances.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TimeOffRequestEntity,
      BalanceSnapshotEntity,
      OutboxJobEntity,
    ]),
    HcmModule,
    BalancesModule,
  ],
  controllers: [TimeOffController],
  providers: [TimeOffService],
  exports: [TimeOffService],
})
export class TimeOffModule {}
