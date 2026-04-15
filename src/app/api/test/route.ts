import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  const host = process.env.DATABRICKS_HOST;
  const token = process.env.DATABRICKS_TOKEN;
  const warehouseId = process.env.DATABRICKS_HTTP_PATH?.split('/').pop();
  const response = await fetch(`https://${host}/api/2.0/sql/statements`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ warehouse_id: warehouseId, statement: 'SELECT 1 as test', wait_timeout: '30s' }),
  });
  const raw = await response.json();
  return NextResponse.json(raw);
}