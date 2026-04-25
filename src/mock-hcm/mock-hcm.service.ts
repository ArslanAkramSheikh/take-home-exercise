import { Injectable, ServiceUnavailableException } from '@nestjs/common';

type BalanceKey = string;

interface AppliedRequestRecord {
  requestId: string;
  hcmReference: string;
  remainingBalance: number;
}

@Injectable()
export class MockHcmService {
  private readonly balances = new Map<BalanceKey, number>();
  private readonly appliedRequests = new Map<string, AppliedRequestRecord>();
  private failValidation = false;
  private failApply = false;
  private unavailable = false;

  private key(employeeId: string, locationId: string): BalanceKey {
    return `${employeeId}::${locationId}`;
  }

  seedDefaults() {
    if (this.balances.size === 0) {
      this.balances.set(this.key('emp-1', 'loc-1'), 10);
      this.balances.set(this.key('emp-2', 'loc-1'), 5);
    }
  }

  setBalance(employeeId: string, locationId: string, balance: number) {
    this.balances.set(this.key(employeeId, locationId), balance);
    return this.getBalance(employeeId, locationId);
  }

  setFailureMode(input: {
    failValidation?: boolean;
    failApply?: boolean;
    unavailable?: boolean;
  }) {
    this.failValidation = input.failValidation ?? this.failValidation;
    this.failApply = input.failApply ?? this.failApply;
    this.unavailable = input.unavailable ?? this.unavailable;
    return {
      failValidation: this.failValidation,
      failApply: this.failApply,
      unavailable: this.unavailable,
    };
  }

  batchUpsert(records: Array<{ employeeId: string; locationId: string; hcmBalance: number }>) {
    for (const record of records) {
      this.balances.set(this.key(record.employeeId, record.locationId), record.hcmBalance);
    }
    return { synced: records.length };
  }

  getBalance(employeeId: string, locationId: string) {
    this.ensureAvailable();
    const balance = this.balances.get(this.key(employeeId, locationId));
    if (typeof balance !== 'number') {
      return {
        employeeId,
        locationId,
        balance: 0,
        checkedAt: new Date().toISOString(),
      };
    }
    return {
      employeeId,
      locationId,
      balance,
      checkedAt: new Date().toISOString(),
    };
  }

  validate(employeeId: string, locationId: string, days: number) {
    this.ensureAvailable();
    if (this.failValidation) {
      return {
        valid: false,
        reason: 'Forced validation failure from mock HCM',
      };
    }

    const key = this.key(employeeId, locationId);
    if (!this.balances.has(key)) {
      return {
        valid: false,
        reason: 'Invalid employee/location combination',
      };
    }

    const currentBalance = this.balances.get(key) ?? 0;
    if (currentBalance < days) {
      return {
        valid: false,
        reason: 'Insufficient balance in HCM',
        currentBalance,
      };
    }

    return {
      valid: true,
      currentBalance,
    };
  }

  apply(employeeId: string, locationId: string, days: number, requestId: string) {
    this.ensureAvailable();

    const prior = this.appliedRequests.get(requestId);
    if (prior) {
      return {
        accepted: true,
        hcmReference: prior.hcmReference,
        remainingBalance: prior.remainingBalance,
      };
    }

    if (this.failApply) {
      throw new ServiceUnavailableException('Forced apply outage from mock HCM');
    }

    const validation = this.validate(employeeId, locationId, days);
    if (!validation.valid) {
      return {
        accepted: false,
        reason: validation.reason,
        remainingBalance: validation.currentBalance,
      };
    }

    const key = this.key(employeeId, locationId);
    const remainingBalance = Number(((this.balances.get(key) ?? 0) - days).toFixed(2));
    this.balances.set(key, remainingBalance);
    const hcmReference = `mock-hcm-${requestId}`;
    this.appliedRequests.set(requestId, {
      requestId,
      hcmReference,
      remainingBalance,
    });

    return {
      accepted: true,
      hcmReference,
      remainingBalance,
    };
  }

  private ensureAvailable() {
    if (this.unavailable) {
      throw new ServiceUnavailableException('Mock HCM unavailable');
    }
  }
}
