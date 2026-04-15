import { NextResponse } from 'next/server';
import { queryDatabricks } from '@/lib/databricks';

export const dynamic = 'force-dynamic';

const QUERY = `
WITH cte_months AS (
    SELECT month_end_date AS month_end
    FROM datawarehouse.core.dim_date
    WHERE date_day <= CURRENT_DATE
      AND date_day >= '2020-01-01'
    GROUP BY ALL
),
cte_member AS (
    SELECT m.member_id, m.client_id, m.client_code,
           m.member_created_date, m.termination_date,
           m.inactive_date, m.term_by_omission_date
    FROM datawarehouse.core.member m
),
cte_client_carveout_detail AS (
    SELECT DISTINCT cpc.ClientId AS client_id, cpc.ProcedureItemCategoryId
    FROM datawarehouse.raw_carehub.carehub__client_procedureitemcategorycarveout cpc
    WHERE cpc.InactiveDate IS NULL AND cpc.CarveOutId IN ('2', '3')
),
cte_client_classification AS (
    SELECT client_id,
           COUNT(DISTINCT ProcedureItemCategoryId) AS num_carveout_categories,
           MAX(CASE WHEN ProcedureItemCategoryId = '1' THEN 1 ELSE 0 END) AS has_bariatric
    FROM cte_client_carveout_detail
    GROUP BY client_id
)
SELECT
    mth.month_end,
    CASE
        WHEN cc.client_id IS NULL THEN 'Voluntary'
        WHEN cc.num_carveout_categories = 1 AND cc.has_bariatric = 1 THEN 'Bariatric Carve-Out'
        ELSE 'Multi Carve-Out'
    END AS carveout_category,
    COUNT(DISTINCT mbr.member_id) AS member_count
FROM cte_member mbr
INNER JOIN cte_months mth
    ON mth.month_end BETWEEN mbr.member_created_date
                         AND COALESCE(mbr.termination_date, mbr.inactive_date, mbr.term_by_omission_date, mth.month_end)
LEFT JOIN cte_client_classification cc ON mbr.client_id = cc.client_id
GROUP BY mth.month_end,
    CASE
        WHEN cc.client_id IS NULL THEN 'Voluntary'
        WHEN cc.num_carveout_categories = 1 AND cc.has_bariatric = 1 THEN 'Bariatric Carve-Out'
        ELSE 'Multi Carve-Out'
    END
ORDER BY mth.month_end ASC, carveout_category
`;

export async function GET() {
  try {
    const data = await queryDatabricks(QUERY, 'member-counts');
    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
