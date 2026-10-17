import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { requiredEnv } from './env';

const globalDb = globalThis as unknown as { prisma?: PrismaClient };

export function getDb(): PrismaClient {
  if (globalDb.prisma) return globalDb.prisma;
  const adapter = new PrismaPg({ connectionString: requiredEnv('DATABASE_URL') });
  const client = new PrismaClient({ adapter });
  globalDb.prisma = client;
  return client;
}
