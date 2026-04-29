import { NextResponse } from 'next/server';
import { queryDatabricks } from '@/lib/databricks';

export const dynamic = 'force-dynamic';

const CASES_QUERY = `
SELECT
  date_format(date_trunc('month', c.case_created_date), 'yyyy-MM') AS yyyy_mm,
  COUNT(DISTINCT c.member_case_id) AS total_calls,
  COUNT(DISTINCT CASE WHEN c.case_closed_reason_category NOT IN ('Provider Inquiry') OR c.case_closed_reason_category IS NULL THEN c.member_case_id END) AS first_call_count,
  COUNT(DISTINCT CASE WHEN c.case_closed_reason_category NOT IN ('Provider Inquiry','General Benefit Inquiry','Lost Case - First Call') OR c.case_closed_reason_category IS NULL THEN c.member_case_id END) AS new_opened_cases,
  COUNT(DISTINCT CASE WHEN c.first_consult_date IS NOT NULL OR c.first_surgery_date IS NOT NULL OR c.member_journey_status IN ('Procedure','Post Procedure','Consultation') THEN c.member_case_id END) AS reached_consult,
  COUNT(DISTINCT CASE WHEN c.first_surgery_date IS NOT NULL OR c.member_journey_status IN ('Procedure','Post Procedure') THEN c.member_case_id END) AS reached_procedure,
  COUNT(DISTINCT CASE WHEN c.case_closed_reason_category = 'Case Complete' THEN c.member_case_id END) AS completed_cases,
  COUNT(DISTINCT CASE WHEN c.first_consult_date IS NOT NULL AND DATEDIFF(c.first_consult_date, c.case_created_date) <= 30 THEN c.member_case_id END) AS consult_within_30_days,
  COUNT(DISTINCT CASE WHEN c.first_surgery_date IS NOT NULL AND DATEDIFF(c.first_surgery_date, c.case_created_date) <= 90 THEN c.member_case_id END) AS surgery_within_90_days
FROM datawarehouse.core.member_case_detail c
WHERE c.product_name <> 'Hinge Health'
  AND c.case_created_date >= '2023-01-01'
  AND (c.case_status NOT IN ('Closed','Void') OR c.case_closed_date >= date_trunc('YEAR', add_months(current_date(), -36)))
GROUP BY date_format(date_trunc('month', c.case_created_date), 'yyyy-MM')
ORDER BY yyyy_mm
`;

const MEMBERS_QUERY = `
SELECT
  date_format(month_end, 'yyyy-MM') AS yyyy_mm,
  SUM(unique_members_18) AS unique_members_18
FROM datawarehouse.client_mart.client_monthly_member_counts
WHERE month_end >= '2023-01-01'
GROUP BY date_format(month_end, 'yyyy-MM')
ORDER BY yyyy_mm
`;

export async function GET() {
  try {
    const [cases, members] = await Promise.all([
      queryDatabricks(CASES_QUERY, 'funnel-cases'),
      queryDatabricks(MEMBERS_QUERY, 'funnel-members'),
    ]);

    // Merge on yyyy_mm
    const memberMap: Record<string, number> = {}
    members.forEach((r: any) => { memberMap[r.yyyy_mm] = parseInt(r.unique_members_18) || 0 })

    const data = cases.map((r: any) => ({
      ...r,
      unique_members_18: memberMap[r.yyyy_mm] || 0,
    }))

    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
