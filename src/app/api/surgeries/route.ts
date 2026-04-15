import { NextResponse } from 'next/server';
import { queryDatabricks } from '@/lib/databricks';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // First test: just count rows
    const count = await queryDatabricks(
      `SELECT COUNT(*) as total FROM datawarehouse.core.member_surgeries`,
      'surgeries-count'
    );
    const data = await queryDatabricks(
      `SELECT * FROM datawarehouse.core.member_surgeries LIMIT 10`,
      'surgeries'
    );
    return NextResponse.json({ count, data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
