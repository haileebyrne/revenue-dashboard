// src/app/api/databricks/route.ts
// Server-side only. Databricks token lives in env vars, never sent to the browser.

import { NextResponse } from 'next/server'
import { runQuery, rowToObject } from '@/lib/databricks'
import { FALLBACK_DATA } from '@/lib/fallback'
import type { DashboardData, Top50Client, CohortClient, KpiData } from '@/lib/types'

export const revalidate = 0 // always fresh

export async function GET() {
  const configured =
    process.env.DATABRICKS_HOST &&
    process.env.DATABRICKS_TOKEN &&
    process.env.DATABRICKS_WAREHOUSE_ID

  if (!configured) {
    return NextResponse.json({ ...FALLBACK_DATA, source: 'fallback' })
  }

  try {
    const [kpiRes, top50Res, cohortRes] = await Promise.all([
      runQuery(`
        SELECT
          apr_mtd_revenue, apr_month_forecast,
          apr_mtd_procedures, apr_proc_forecast,
          ytd_procedures, ytd_revenue,
          apr_mtd_revenue_vs_py, apr_month_forecast_vs_budget,
          apr_mtd_procedures_vs_py, apr_proc_forecast_vs_budget,
          ytd_procedures_vs_py, ytd_revenue_vs_py
        FROM revenue.kpis
        WHERE period = '2026-04'
        LIMIT 1
      `),
      runQuery(`
        SELECT
          client_name, vintage, fee_structure, carveout, ees,
          ytd_procedures_26, ytd_procedures_25,
          apr_revenue_26, ytd_revenue_26, ytd_revenue_25,
          ytd_vs_py_pct, ytd_vs_budget_pct
        FROM revenue.top50_clients
        WHERE period = '2026-04'
        ORDER BY ytd_revenue_26 DESC NULLS LAST
      `),
      runQuery(`
        SELECT
          client_name, go_live_date, ees, fee_structure, carveout, vintage,
          ytd_call_rate, eop_active_cases, ytd_procedures,
          apr_revenue, ytd_revenue,
          ytd_vs_budget_pct, ytd_vs_model_pct
        FROM revenue.cohort_2026
        WHERE period = '2026-04'
        ORDER BY ytd_revenue DESC NULLS LAST
      `),
    ])

    const kpis = kpiRes.rows[0]
      ? (rowToObject(kpiRes.columns, kpiRes.rows[0]) as unknown as KpiData)
      : FALLBACK_DATA.kpis

    const top50 = top50Res.rows.map(
      (r) => rowToObject(top50Res.columns, r) as unknown as Top50Client
    )

    const cohort = cohortRes.rows.map(
      (r) => rowToObject(cohortRes.columns, r) as unknown as CohortClient
    )

    const payload: DashboardData = {
      kpis,
      top50,
      cohort,
      refreshedAt: new Date().toISOString(),
      source: 'databricks',
    }

    return NextResponse.json(payload)
  } catch (err) {
    console.error('[Databricks API error]', err)
    // Degrade gracefully — return fallback with error flag
    return NextResponse.json(
      { ...FALLBACK_DATA, source: 'fallback', error: (err as Error).message },
      { status: 200 }
    )
  }
}
