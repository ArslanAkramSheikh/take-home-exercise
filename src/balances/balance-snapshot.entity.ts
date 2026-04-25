import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

@Entity({ name: 'balance_snapshots' })
@Unique('uq_employee_location', ['employeeId', 'locationId'])
export class BalanceSnapshotEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  employeeId!: string;

  @Column({ type: 'varchar' })
  locationId!: string;

  @Column({ type: 'float', default: 0 })
  hcmBalance!: number;

  @Column({ type: 'float', default: 0 })
  reservedBalance!: number;

  @Column({ type: 'datetime', nullable: true })
  lastRealtimeCheckedAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lastBatchSyncedAt!: Date | null;

  @Column({ type: 'varchar', nullable: true })
  lastSyncSource!: string | null;

  @Column({ type: 'boolean', default: false })
  balanceDriftDetected!: boolean;

  @VersionColumn()
  version!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  get projectedAvailableBalance(): number {
    return Number((this.hcmBalance - this.reservedBalance).toFixed(2));
  }
}
