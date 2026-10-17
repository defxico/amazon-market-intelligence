import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const placeholderUrl = 'postgresql://ami:ami@localhost:5432/amazon_market_intelligence?schema=public';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? placeholderUrl,
  },
});
