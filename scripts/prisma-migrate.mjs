import { spawnSync } from 'node:child_process';

const command = process.argv[2];
if (!['dev', 'deploy', 'status'].includes(command)) {
  console.error('Usage: npm run db:migrate | npm run db:deploy | npm run db:status');
  process.exit(2);
}

if (command === 'dev' || (command === 'status' && process.env.NODE_ENV !== 'production')) {
  await import('dotenv/config');
}

if (!process.env.DIRECT_URL) {
  console.error('DIRECT_URL is required for database migrations.');
  process.exit(2);
}

const args = command === 'dev'
  ? ['migrate', 'dev']
  : command === 'deploy'
    ? ['migrate', 'deploy']
    : ['migrate', 'status'];

const result = spawnSync('prisma', args, { stdio: 'inherit', shell: process.platform === 'win32' });
if (result.error) {
  console.error('Could not start Prisma CLI. Run this through an npm script after npm install.');
  process.exit(1);
}
process.exit(result.status ?? 1);
