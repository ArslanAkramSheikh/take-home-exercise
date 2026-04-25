import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TimeOffRequestStatus } from '../common/enums/request-status.enum';

@Entity({ name: 'time_off_requests' })
@Index('idx_unique_idempotency_key', ['idempotencyKey'], { unique: true })
export class TimeOffRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  employeeId!: string;

  @Column({ type: 'varchar' })
  locationId!: string;

  @Column({ type: 'date' })
  startDate!: string;

  @Column({ type: 'date' })
  endDate!: string;

  @Column({ type: 'float' })
  days!: number;

  @Column({
    type: 'varchar',
    default: TimeOffRequestStatus.PENDING_MANAGER_APPROVAL,
  })
  status!: TimeOffRequestStatus;

  @Column({ type: 'varchar', nullable: true })
  managerId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  rejectionReason!: string | null;

  @Column({ type: 'varchar', nullable: true })
  hcmReference!: string | null;

  @Column({ type: 'varchar' })
  idempotencyKey!: string;

  @Column({ type: 'datetime', nullable: true })
  hcmSyncedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
