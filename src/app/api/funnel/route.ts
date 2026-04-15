import { NextResponse } from 'next/server';
import { queryDatabricks } from '@/lib/databricks';

export const dynamic = 'force-dynamic';

const QUERY = `
WITH all_case_report AS (
  SELECT * FROM datawarehouse.core.member_case_detail
  WHERE product_name <> 'Hinge Health'
    AND (case_status NOT IN ('Closed', 'Void')
      OR case_closed_date >= date_trunc('YEAR', add_months(current_date(), -36)))
),
month_series AS (
  SELECT last_day(m) AS month_end, date_trunc('month', m) AS month_start,
         year(m) AS year, month(m) AS month, date_format(m, 'yyyy-MM') AS yyyy_mm
  FROM (SELECT explode(sequence(to_date('2023-01-01'), date_trunc('month', current_date()), interval 1 month)) AS m)
),
funnel_metrics AS (
  SELECT c.client_code, date_trunc('month', c.case_created_date) AS case_month,
    COUNT(DISTINCT c.member_case_id) AS total_calls,
    COUNT(DISTINCT CASE WHEN c.case_closed_reason_category IS NULL OR c.case_closed_reason_category NOT IN ('Provider Inquiry') THEN c.member_case_id END) AS first_call_count,
    COUNT(DISTINCT CASE WHEN c.case_closed_reason_category IS NULL OR c.case_closed_reason_category NOT IN ('Provider Inquiry','General Benefit Inquiry','Lost Case - First Call') THEN c.member_case_id END) AS new_opened_cases,
    COUNT(DISTINCT CASE WHEN c.first_consult_date IS NOT NULL OR c.first_surgery_date IS NOT NULL OR c.case_closed_reason_category IN ('Case Complete','Avoided Procedure') OR c.member_journey_status IN ('Procedure','Post Procedure','Consultation') THEN c.member_case_id END) AS reached_consult,
    COUNT(DISTINCT CASE WHEN c.first_surgery_date IS NOT NULL OR c.member_journey_status IN ('Procedure','Post Procedure') THEN c.member_case_id END) AS reached_procedure,
    COUNT(DISTINCT CASE WHEN c.case_closed_reason_category = 'Case Complete' THEN c.member_case_id END) AS completed_cases,
    COUNT(DISTINCT CASE WHEN c.first_consult_date IS NOT NULL AND c.first_consult_date >= c.case_created_date AND DATEDIFF(c.first_consult_date, c.case_created_date) <= 30 THEN c.member_case_id END) AS consult_within_30_days,
    COUNT(DISTINCT CASE WHEN c.first_surgery_date IS NOT NULL AND c.first_surgery_date >= c.case_created_date AND DATEDIFF(c.first_surgery_date, c.case_created_date) <= 90 THEN c.member_case_id END) AS surgery_within_90_days
  FROM all_case_report c WHERE c.case_created_date IS NOT NULL
  GROUP BY c.client_code, date_trunc('month', c.case_created_date)
),
procedure_counts AS (
  SELECT s.client_code, date_trunc('month', s.date_of_service) AS service_month,
         COUNT(DISTINCT s.service_id) AS procedure_count
  FROM datawarehouse.core.member_surgeries s
  WHERE s.requested_procedure_item_category <> 'INFUSION' AND s.date_of_service IS NOT NULL
  GROUP BY s.client_code, date_trunc('month', s.date_of_service)
),
member_counts AS (
  SELECT month_end, client_code,
         sum(unique_ee) AS total_unique_ee,
         sum(unique_members) AS total_unique_members,
         sum(unique_members_18) AS total_unique_members_18
  FROM datawarehouse.client_mart.client_monthly_member_counts
  GROUP BY month_end, client_code
),
client_golive AS (
  SELECT client_code, client_golive_date FROM datawarehouse.client_mart.client
),
client_month_spine AS (
  SELECT DISTINCT ms.month_start, ms.month_end, ms.year, ms.month, ms.yyyy_mm, cc.client_code
  FROM month_series ms
  CROSS JOIN (SELECT DISTINCT client_code FROM all_case_report) cc
)
SELECT sp.year, sp.month, sp.yyyy_mm, sp.client_code, cg.client_golive_date,
  COALESCE(mc.total_unique_ee, 0) AS unique_ee,
  COALESCE(mc.total_unique_members, 0) AS unique_members,
  COALESCE(mc.total_unique_members_18, 0) AS unique_members_18,
  COALESCE(fm.total_calls, 0) AS total_calls,
  COALESCE(fm.first_call_count, 0) AS first_call_count,
  COALESCE(fm.new_opened_cases, 0) AS new_opened_cases,
  COALESCE(fm.reached_consult, 0) AS reached_consult,
  COALESCE(fm.reached_procedure, 0) AS reached_procedure,
  COALESCE(fm.completed_cases, 0) AS completed_cases,
  COALESCE(fm.consult_within_30_days, 0) AS consult_within_30_days,
  COALESCE(fm.surgery_within_90_days, 0) AS surgery_within_90_days,
  COALESCE(pc.procedure_count, 0) AS procedure_count
FROM client_month_spine sp
LEFT JOIN client_golive cg ON cg.client_code = sp.client_code
LEFT JOIN funnel_metrics fm ON fm.client_code = sp.client_code AND fm.case_month = sp.month_start
LEFT JOIN procedure_counts pc ON pc.client_code = sp.client_code AND pc.service_month = sp.month_start
LEFT JOIN member_counts mc ON mc.client_code = sp.client_code AND mc.month_end = sp.month_end
ORDER BY sp.year DESC, sp.month DESC, sp.client_code
LIMIT 500
`;

export async function GET() {
  try {
    const data = await queryDatabricks(QUERY, 'funnel');
    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
