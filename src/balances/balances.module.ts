import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalanceSnapshotEntity } from './balance-snapshot.entity';
import { BalancesController } from './balances.controller';
import { BalancesService } from './balances.service';
import { TimeOffRequestEntity } from '../time-off/time-off-request.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BalanceSnapshotEntity, TimeOffRequestEntity])],
  controllers: [BalancesController],
  providers: [BalancesService],
  exports: [BalancesService],
})
export class BalancesModule {}
