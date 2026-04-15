import { NextResponse } from 'next/server';
import { queryDatabricks } from '@/lib/databricks';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const year = new Date().getFullYear();

    const [actual, budget, inputs] = await Promise.all([
      queryDatabricks(`
        SELECT client_name, fee_structure, carve_out, ees, go_live_date,
               revenue_month, actual_revenue
        FROM sandboxwarehouse.growth_analytics.actual_revenues
      `, 'actual-rev'),
      queryDatabricks(`
        SELECT client_name, revenue_month, surgery_care_revenue, cohort, fee_structure, carve_out, ees
        FROM sandboxwarehouse.growth_analytics.budgeted_revenues
      `, 'budget-rev'),
      queryDatabricks(`
        SELECT care_hub_name, fee_structure, carve_out_2, ees, cohort, modeling_go_live, contract_start_date
        FROM sandboxwarehouse.growth_analytics.client_inputs
        WHERE care_hub_name IS NOT NULL
      `, 'client-inputs'),
    ]);

    const sum = (rows: any[], field: string) =>
      rows.reduce((acc: number, r: any) => acc + (parseFloat(r[field]) || 0), 0);

    const aprActual = actual.filter((r: any) => r.revenue_month?.startsWith(`${year}-04`));
    const ytdActual = actual.filter((r: any) => r.revenue_month?.startsWith(`${year}`));
    const aprBudget = budget.filter((r: any) => r.revenue_month?.startsWith(`${year}-04`));
    const ytdBudget = budget.filter((r: any) => r.revenue_month?.startsWith(`${year}`));
    const pyYtd    = actual.filter((r: any) => r.revenue_month?.startsWith(`${year - 1}`));
    const pyApr    = actual.filter((r: any) => r.revenue_month?.startsWith(`${year - 1}-04`));

    const aprMtdRev  = sum(aprActual, 'actual_revenue');
    const ytdRev     = sum(ytdActual, 'actual_revenue');
    const aprBudTot  = sum(aprBudget, 'surgery_care_revenue');
    const ytdBudTot  = sum(ytdBudget, 'surgery_care_revenue');
    const pyAprRev   = sum(pyApr, 'actual_revenue');
    const pyYtdRev   = sum(pyYtd, 'actual_revenue');

    // ── top50 by client ───────────────────────────────────────────────────
    const clientMap: Record<string, any> = {};
    for (const r of actual) {
      const n = r.client_name;
      if (!clientMap[n]) clientMap[n] = {
        client_name: n, fee_structure: r.fee_structure || '—',
        carveout: r.carve_out || '—', ees: parseFloat(r.ees) || null,
        vintage: r.go_live_date ? new Date(r.go_live_date).getFullYear() : null,
        ytd_rev: 0, apr_rev: 0, py_rev: 0,
      };
      const rev = parseFloat(r.actual_revenue) || 0;
      if (r.revenue_month?.startsWith(`${year}`)) clientMap[n].ytd_rev += rev;
      if (r.revenue_month?.startsWith(`${year}-04`)) clientMap[n].apr_rev += rev;
      if (r.revenue_month?.startsWith(`${year - 1}`)) clientMap[n].py_rev += rev;
    }

    const budClientMap: Record<string, number> = {};
    for (const r of budget) {
      if (r.revenue_month?.startsWith(`${year}`)) {
        budClientMap[r.client_name] = (budClientMap[r.client_name] || 0) + (parseFloat(r.surgery_care_revenue) || 0);
      }
    }

    const top50 = Object.values(clientMap)
      .map((c: any) => ({
        client_name: c.client_name,
        vintage: c.vintage,
        fee_structure: c.fee_structure,
        carveout: c.carveout,
        ees: c.ees,
        ytd_procedures_26: null,
        ytd_procedures_25: null,
        apr_revenue_26: Math.round(c.apr_rev / 1000),
        ytd_revenue_26: Math.round(c.ytd_rev / 1000),
        ytd_revenue_25: c.py_rev ? Math.round(c.py_rev / 1000) : null,
        ytd_vs_py_pct: c.py_rev ? parseFloat(((c.ytd_rev - c.py_rev) / c.py_rev * 100).toFixed(1)) : null,
        ytd_vs_budget_pct: budClientMap[c.client_name]
          ? parseFloat(((c.ytd_rev - budClientMap[c.client_name]) / budClientMap[c.client_name] * 100).toFixed(1))
          : null,
      }))
      .sort((a: any, b: any) => (b.ytd_revenue_26 || 0) - (a.ytd_revenue_26 || 0))
      .slice(0, 50);

    top50.push({
      client_name: 'Total Lantern Book', vintage: null, fee_structure: '—', carveout: '—', ees: null,
      ytd_procedures_26: null, ytd_procedures_25: null,
      apr_revenue_26: Math.round(aprMtdRev / 1000),
      ytd_revenue_26: Math.round(ytdRev / 1000),
      ytd_revenue_25: pyYtdRev ? Math.round(pyYtdRev / 1000) : null,
      ytd_vs_py_pct: pyYtdRev ? parseFloat(((ytdRev - pyYtdRev) / pyYtdRev * 100).toFixed(1)) : null,
      ytd_vs_budget_pct: ytdBudTot ? parseFloat(((ytdRev - ytdBudTot) / ytdBudTot * 100).toFixed(1)) : null,
      is_total: true,
    });

    // ── cohort ────────────────────────────────────────────────────────────
    const cohort = inputs
      .filter((c: any) => c.cohort >= year - 1)
      .map((c: any) => {
        const rev = clientMap[c.care_hub_name];
        return {
          client_name: c.care_hub_name,
          go_live_date: c.modeling_go_live || c.contract_start_date,
          ees: c.ees, fee_structure: c.fee_structure || '—',
          carveout: c.carve_out_2 || '—', vintage: c.cohort,
          ytd_call_rate: null, eop_active_cases: null, ytd_procedures: null,
          apr_revenue: rev ? Math.round(rev.apr_rev / 1000) : 0,
          ytd_revenue: rev ? Math.round(rev.ytd_rev / 1000) : 0,
          ytd_vs_budget_pct: null, ytd_vs_model_pct: null,
        };
      });

    return NextResponse.json({
      source: 'databricks',
      refreshedAt: new Date().toISOString(),
      kpis: {
        apr_mtd_revenue: Math.round(aprMtdRev),
        apr_month_forecast: Math.round(aprBudTot),
        apr_mtd_procedures: null,
        apr_proc_forecast: null,
        ytd_procedures: null,
        ytd_revenue: Math.round(ytdRev),
        apr_mtd_revenue_vs_py: pyAprRev ? parseFloat(((aprMtdRev - pyAprRev) / pyAprRev * 100).toFixed(1)) : null,
        apr_month_forecast_vs_budget: aprBudTot ? parseFloat(((aprMtdRev - aprBudTot) / aprBudTot * 100).toFixed(1)) : null,
        apr_mtd_procedures_vs_py: null,
        apr_proc_forecast_vs_budget: null,
        ytd_procedures_vs_py: null,
        ytd_revenue_vs_py: pyYtdRev ? parseFloat(((ytdRev - pyYtdRev) / pyYtdRev * 100).toFixed(1)) : null,
      },
      top50,
      cohort,
    });

  } catch (error: any) {
    console.error('Dashboard API error:', error);
    const { FALLBACK_DATA } = await import('@/lib/fallback');
    return NextResponse.json({ ...FALLBACK_DATA, error: error.message });
  }
}