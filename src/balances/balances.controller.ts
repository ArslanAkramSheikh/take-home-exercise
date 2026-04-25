import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { BalancesService } from './balances.service';
import { BalanceBatchSyncDto } from './dto/upsert-balance-batch.dto';

@Controller('balances')
export class BalancesController {
  constructor(private readonly balancesService: BalancesService) {}

  @Get(':employeeId/:locationId')
  getBalance(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
  ) {
    return this.balancesService.getBalance(employeeId, locationId);
  }

  @Post('batch-sync')
  batchSync(@Body() dto: BalanceBatchSyncDto) {
    return this.balancesService.batchSync(dto);
  }
}
