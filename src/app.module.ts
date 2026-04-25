import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getDatabaseConfig } from './config/database.config';
import { BalancesModule } from './balances/balances.module';
import { TimeOffModule } from './time-off/time-off.module';
import { OutboxModule } from './outbox/outbox.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { MockHcmModule } from './mock-hcm/mock-hcm.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        getDatabaseConfig(configService.get<string>('DB_PATH', 'data/timeoff.sqlite')),
    }),
    BalancesModule,
    TimeOffModule,
    OutboxModule,
    ReconciliationModule,
    MockHcmModule,
  ],
})
export class AppModule {}
