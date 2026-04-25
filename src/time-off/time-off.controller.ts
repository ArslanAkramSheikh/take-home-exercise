import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TimeOffService } from './time-off.service';
import { CreateTimeOffRequestDto } from './dto/create-time-off-request.dto';
import { ApproveRequestDto, RejectRequestDto } from './dto/request-action.dto';
import { TimeOffRequestStatus } from '../common/enums/request-status.enum';

@Controller('time-off-requests')
export class TimeOffController {
  constructor(private readonly timeOffService: TimeOffService) {}

  @Post()
  create(@Body() dto: CreateTimeOffRequestDto) {
    return this.timeOffService.createRequest(dto);
  }

  @Get()
  list(
    @Query('employeeId') employeeId?: string,
    @Query('locationId') locationId?: string,
    @Query('status') status?: TimeOffRequestStatus,
  ) {
    return this.timeOffService.list({ employeeId, locationId, status });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.timeOffService.findOne(id);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() dto: ApproveRequestDto) {
    return this.timeOffService.approveRequest(id, dto.managerId);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectRequestDto) {
    return this.timeOffService.rejectRequest(id, dto.managerId, dto.reason);
  }
}
