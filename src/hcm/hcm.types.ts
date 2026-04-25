export interface HcmBalanceResponse {
  employeeId: string;
  locationId: string;
  balance: number;
  checkedAt: string;
}

export interface HcmValidationResult {
  valid: boolean;
  reason?: string;
  currentBalance?: number;
}

export interface HcmApplyResult {
  accepted: boolean;
  hcmReference?: string;
  remainingBalance?: number;
  reason?: string;
}

export interface HcmClient {
  getBalance(employeeId: string, locationId: string): Promise<HcmBalanceResponse>;
  validateRequest(
    employeeId: string,
    locationId: string,
    days: number,
  ): Promise<HcmValidationResult>;
  applyTimeOff(input: {
    employeeId: string;
    locationId: string;
    days: number;
    requestId: string;
  }): Promise<HcmApplyResult>;
}

export const HCM_CLIENT = Symbol('HCM_CLIENT');
