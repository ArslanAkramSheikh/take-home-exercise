import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { BalanceSnapshotEntity } from '../balances/balance-snapshot.entity';
import { TimeOffRequestEntity } from '../time-off/time-off-request.entity';
import { OutboxJobEntity } from '../outbox/outbox-job.entity';

export function getDatabaseConfig(dbPath: string): TypeOrmModuleOptions {
  return {
    type: 'better-sqlite3',
    database: dbPath,
    entities: [BalanceSnapshotEntity, TimeOffRequestEntity, OutboxJobEntity],
    synchronize: true,
    autoLoadEntities: true,
  };
}
