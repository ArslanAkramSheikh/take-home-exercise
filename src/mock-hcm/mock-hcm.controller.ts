import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { MockHcmService } from './mock-hcm.service';
import { BalanceBatchSyncDto } from '../balances/dto/upsert-balance-batch.dto';

@Controller('mock-hcm')
export class MockHcmController {
  constructor(private readonly mockHcmService: MockHcmService) {
    this.mockHcmService.seedDefaults();
  }

  @Get('balances/:employeeId/:locationId')
  getBalance(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
  ) {
    return this.mockHcmService.getBalance(employeeId, locationId);
  }

  @Post('validate')
  validate(@Body() body: { employeeId: string; locationId: string; days: number }) {
    return this.mockHcmService.validate(body.employeeId, body.locationId, body.days);
  }

  @Post('apply')
  apply(
    @Body()
    body: { employeeId: string; locationId: string; days: number; requestId: string },
  ) {
    return this.mockHcmService.apply(
      body.employeeId,
      body.locationId,
      body.days,
      body.requestId,
    );
  }

  @Post('admin/batch')
  batch(@Body() dto: BalanceBatchSyncDto) {
    return this.mockHcmService.batchUpsert(dto.records);
  }

  @Post('admin/set-balance')
  setBalance(
    @Body() body: { employeeId: string; locationId: string; balance: number },
  ) {
    return this.mockHcmService.setBalance(body.employeeId, body.locationId, body.balance);
  }

  @Post('admin/failure-mode')
  setFailureMode(
    @Body()
    body: {
      failValidation?: boolean;
      failApply?: boolean;
      unavailable?: boolean;
    },
  ) {
    return this.mockHcmService.setFailureMode(body);
  }
}
