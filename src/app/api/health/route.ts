import { jsonResponse } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return jsonResponse({ status: 'ok', service: 'amazon-market-intelligence', version: '2.0' });
}
