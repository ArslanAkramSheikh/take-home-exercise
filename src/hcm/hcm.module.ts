import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HCM_CLIENT } from './hcm.types';
import { HttpHcmClient } from './http-hcm.client';

@Module({
  imports: [ConfigModule, HttpModule],
  providers: [
    HttpHcmClient,
    {
      provide: HCM_CLIENT,
      useExisting: HttpHcmClient,
    },
  ],
  exports: [HCM_CLIENT],
})
export class HcmModule {}
