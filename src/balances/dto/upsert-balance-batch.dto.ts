import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BalanceRecordDto {
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  hcmBalance!: number;

  @IsOptional()
  @IsDateString()
  effectiveAt?: string;
}

export class BalanceBatchSyncDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BalanceRecordDto)
  records!: BalanceRecordDto[];
}
