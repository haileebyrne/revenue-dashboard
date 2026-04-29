import { NextResponse } from 'next/server';
import { queryDatabricks } from '@/lib/databricks';

export const dynamic = 'force-dynamic';

const QUERY = `
SELECT
  date_format(date_trunc('month', c.case_created_date), 'yyyy-MM') AS yyyy_mm,
  COUNT(DISTINCT c.member_case_id) AS total_calls,
  COUNT(DISTINCT CASE WHEN c.case_closed_reason_category NOT IN ('Provider Inquiry') OR c.case_closed_reason_category IS NULL THEN c.member_case_id END) AS first_call_count,
  COUNT(DISTINCT CASE WHEN c.case_closed_reason_category NOT IN ('Provider Inquiry','General Benefit Inquiry','Lost Case - First Call') OR c.case_closed_reason_category IS NULL THEN c.member_case_id END) AS new_opened_cases,
  COUNT(DISTINCT CASE WHEN c.first_consult_date IS NOT NULL OR c.first_surgery_date IS NOT NULL OR c.member_journey_status IN ('Procedure','Post Procedure','Consultation') THEN c.member_case_id END) AS reached_consult,
  COUNT(DISTINCT CASE WHEN c.first_surgery_date IS NOT NULL OR c.member_journey_status IN ('Procedure','Post Procedure') THEN c.member_case_id END) AS reached_procedure,
  COUNT(DISTINCT CASE WHEN c.case_closed_reason_category = 'Case Complete' THEN c.member_case_id END) AS completed_cases
FROM datawarehouse.core.member_case_detail c
WHERE c.case_created_date >= '2024-01-01'
  AND c.product_name <> 'Hinge Health'
  AND (c.case_status NOT IN ('Closed','Void') OR c.case_closed_date >= date_trunc('YEAR', add_months(current_date(), -36)))
GROUP BY date_format(date_trunc('month', c.case_created_date), 'yyyy-MM')
ORDER BY yyyy_mm
`;

export async function GET() {
  try {
    const data = await queryDatabricks(QUERY, 'funnel');
    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
