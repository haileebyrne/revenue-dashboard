// src/app/api/admin/clients/route.ts
// Server-side only. Validates the admin secret before writing to Databricks.
// Called from AdminClientsClient to execute the INSERT without exposing credentials.

import { NextRequest, NextResponse } from 'next/server'
import { runQuery } from '@/lib/databricks'

export async function POST(req: NextRequest) {
  // Gate on admin secret
  const secret = req.headers.get('x-admin-secret')
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { client_name, ees, vintage, fee_structure, carveout, go_live_date, period = '2026-04' } = body

  if (!client_name || !vintage || !fee_structure || !carveout) {
    return NextResponse.json({ error: 'client_name, vintage, fee_structure, and carveout are required.' }, { status: 400 })
  }

  const safeName = String(client_name).replace(/'/g, "''")
  const eesVal = ees ? parseInt(String(ees)) : 'NULL'
  const goLive = go_live_date ? `'${go_live_date}'` : 'NULL'

  const insertTop50 = `
    INSERT INTO revenue.top50_clients
      (client_name, vintage, fee_structure, carveout, ees, period,
       ytd_procedures_26, ytd_procedures_25, apr_revenue_26,
       ytd_revenue_26, ytd_revenue_25, ytd_vs_py_pct, ytd_vs_budget_pct)
    VALUES
      ('${safeName}', ${vintage}, '${fee_structure}', '${carveout}',
       ${eesVal}, '${period}',
       NULL, NULL, NULL, NULL, NULL, NULL, NULL)
  `

  const insertCohort = `
    INSERT INTO revenue.cohort_2026
      (client_name, go_live_date, ees, fee_structure, carveout, vintage, period,
       ytd_call_rate, eop_active_cases, ytd_procedures,
       apr_revenue, ytd_revenue, ytd_vs_budget_pct, ytd_vs_model_pct)
    VALUES
      ('${safeName}', ${goLive}, ${eesVal}, '${fee_structure}', '${carveout}',
       ${vintage}, '${period}',
       NULL, NULL, NULL, NULL, NULL, NULL, NULL)
  `

  try {
    if (body.add_to_top50 !== false) await runQuery(insertTop50)
    if (body.add_to_cohort === true) await runQuery(insertCohort)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Admin client insert error]', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
