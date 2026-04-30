import { NextResponse } from 'next/server';
import { queryDatabricks } from '@/lib/databricks';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const QUERY = `
SELECT
  YEAR(date_of_service) AS yr,
  MONTH(date_of_service) AS mo,
  COUNT(*) AS proc_count
FROM datawarehouse.core.member_surgeries
WHERE date_of_service >= '2024-01-01'
  AND requested_procedure_item_category <> 'INFUSION'
GROUP BY YEAR(date_of_service), MONTH(date_of_service)
ORDER BY yr, mo
`;

export async function GET() {
  try {
    const data = await queryDatabricks(QUERY, 'procs-v1');
    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
