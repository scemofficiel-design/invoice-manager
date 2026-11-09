import type { CompanyRole } from '@im/shared/constants';
import type { CurrentUser } from '@im/shared/types';
import type { AppConfig } from './config/index';
import type { Connection } from './database/connection';

declare module 'fastify' {
  interface FastifyInstance {
    conn: Connection;
    config: AppConfig;
  }
  interface FastifyRequest {
    user: CurrentUser | null;
    sessionToken: string | null;
    company: { id: string; role: CompanyRole } | null;
  }
}
