import { HttpService } from '@nestjs/axios';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  HcmApplyResult,
  HcmBalanceResponse,
  HcmClient,
  HcmValidationResult,
} from './hcm.types';

@Injectable()
export class HttpHcmClient implements HcmClient {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private get baseUrl(): string {
    return this.configService.get<string>('HCM_BASE_URL', 'http://localhost:3000/mock-hcm');
  }

  async getBalance(
    employeeId: string,
    locationId: string,
  ): Promise<HcmBalanceResponse> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<HcmBalanceResponse>(
          `${this.baseUrl}/balances/${employeeId}/${locationId}`,
        ),
      );
      return data;
    } catch {
      throw new ServiceUnavailableException('HCM balance lookup failed');
    }
  }

  async validateRequest(
    employeeId: string,
    locationId: string,
    days: number,
  ): Promise<HcmValidationResult> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<HcmValidationResult>(`${this.baseUrl}/validate`, {
          employeeId,
          locationId,
          days,
        }),
      );
      return data;
    } catch {
      throw new ServiceUnavailableException('HCM validation failed');
    }
  }

  async applyTimeOff(input: {
    employeeId: string;
    locationId: string;
    days: number;
    requestId: string;
  }): Promise<HcmApplyResult> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<HcmApplyResult>(`${this.baseUrl}/apply`, input, {
          headers: {
            'x-idempotency-key': input.requestId,
          },
        }),
      );
      return data;
    } catch {
      throw new ServiceUnavailableException('HCM apply failed');
    }
  }
}
