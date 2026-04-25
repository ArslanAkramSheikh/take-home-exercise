import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ApproveRequestDto {
  @IsString()
  @IsNotEmpty()
  managerId!: string;
}

export class RejectRequestDto {
  @IsString()
  @IsNotEmpty()
  managerId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
