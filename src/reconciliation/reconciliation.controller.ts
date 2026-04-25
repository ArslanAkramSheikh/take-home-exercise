import { Controller, Post } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';

@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post('run')
  run() {
    return this.reconciliationService.runRealtimeReconciliation();
  }
}
