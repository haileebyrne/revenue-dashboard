import { NextResponse } from 'next/server';
import { queryDatabricks } from '@/lib/databricks';

export const dynamic = 'force-dynamic';

function carveoutLabel(val: any): string {
  const n = parseFloat(val);
  if (!val || isNaN(n) || n === 0) return 'Voluntary';
  if (n > 1) return 'Multi Carve-Out';
  if (n === 1) return 'Bariatric Carve-Out';
  return 'Voluntary';
}

function businessDaysInMonth(year: number, month: number): number {
  let count = 0;
  const days = new Date(year, month, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

function businessDayOfMonth(date: Date): number {
  let count = 0;
  const year = date.getFullYear();
  const month = date.getMonth();
  for (let d = 1; d <= date.getDate(); d++) {
    const dow = new Date(year, month, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

// Scheduling curve 12-month averages by business day (from your Excel)
const SCHEDULING_CURVE: Record<number, number> = {
  1: 0.5959, 2: 0.6249, 3: 0.6532, 4: 0.6789, 5: 0.7083,
  6: 0.7347, 7: 0.7595, 8: 0.7839, 9: 0.8076, 10: 0.8298,
  11: 0.8493, 12: 0.8667, 13: 0.8830, 14: 0.8976, 15: 0.9117,
  16: 0.9251, 17: 0.9366, 18: 0.9440, 19: 0.9517, 20: 0.9578,
  21: 0.9634, 22: 0.9670, 23: 0.9704,
};

export async function GET() {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const todayStr = now.toISOString().split('T')[0];
    const monthStr = String(month).padStart(2, '0');
    const curMonthStart = `${year}-${monthStr}-01`;
    const ytdStart = `${year}-01-01`;

    const currentBizDay = businessDayOfMonth(now);
    const totalBizDays = businessDaysInMonth(year, month);
    const curveAtToday = SCHEDULING_CURVE[currentBizDay] || 0.85;
    const scaleUpFactor = curveAtToday > 0 ? 1 / curveAtToday : 1;

    const [actual, budget, inputs, surgeries, cpp] = await Promise.all([
      // Actual revenues
      queryDatabricks(`
        SELECT client_name, fee_structure, carve_out, ees, go_live_date,
               revenue_month, actual_revenue
        FROM sandboxwarehouse.growth_analytics.actual_revenues
      `, 'actual-rev'),

      // Budgeted revenues
      queryDatabricks(`
        SELECT client_name, revenue_month, surgery_care_revenue, cohort,
               fee_structure, carve_out, ees
        FROM sandboxwarehouse.growth_analytics.budgeted_revenues
      `, 'budget-rev'),

      // Client inputs
      queryDatabricks(`
        SELECT care_hub_name, fee_structure, carve_out, ees, cohort,
               modeling_go_live, contract_start_date
        FROM sandboxwarehouse.growth_analytics.client_inputs
        WHERE care_hub_name IS NOT NULL
      `, 'client-inputs'),

      // Current month scheduled procedures from member_surgeries
      queryDatabricks(`
        SELECT
          s.client_code,
          ci.care_hub_name,
          ci.fee_structure,
          ci.carve_out,
          CAST(ci.variable_pct_2 AS DOUBLE) AS variable_pct,
          s.service_id,
          s.date_of_service,
          s.completed_procedures,
          s.Requested_Procedure_Item_Category AS category,
          s.requested_procedure_item_category <> 'INFUSION' AS is_surgical
        FROM datawarehouse.core.member_surgeries s
        LEFT JOIN sandboxwarehouse.growth_analytics.client_inputs ci
          ON s.client_code = ci.client_id
        WHERE YEAR(s.date_of_service) = ${year}
          AND MONTH(s.date_of_service) = ${month}
          AND s.requested_procedure_item_category <> 'INFUSION'
      `, 'cur-month-surgeries'),

      // Avg case rates by Carehub Category from combined procedure pricing
      queryDatabricks(`
        SELECT
          \`Carehub Category\` AS category,
          AVG(CAST(REPLACE(REPLACE(\`Case Rates Lantern\`, '$', ''), ',', '') AS DOUBLE)) AS avg_lantern_rate,
          AVG(CAST(REPLACE(REPLACE(\`Savings \$\`, '$', ''), ',', '') AS DOUBLE)) AS avg_savings
        FROM sandboxwarehouse.growth_analytics.combined_procedure_pricing
        WHERE \`Carehub Category\` IS NOT NULL
          AND \`Case Rates Lantern\` IS NOT NULL
          AND \`Case Rates Lantern\` <> ''
        GROUP BY \`Carehub Category\`
      `, 'avg-case-rates'),
    ]);

    // ── Build avg case rate lookup by category ─────────────────────────
    const avgRates: Record<string, { rate: number; savings: number }> = {};
    for (const r of cpp) {
      avgRates[r.category?.toUpperCase()] = {
        rate: parseFloat(r.avg_lantern_rate) || 0,
        savings: parseFloat(r.avg_savings) || 0,
      };
    }

    // ── Calculate estimated revenue per procedure ──────────────────────
    function estRevenue(
      category: string,
      feeStructure: string,
      variablePct: number,
    ): number {
      const cat = category?.toUpperCase();
      const rates = avgRates[cat] || { rate: 0, savings: 0 };
      const pct = variablePct || 0;
      const fs = (feeStructure || '').toLowerCase();

      if (fs.includes('% of savings') || fs.includes('savings')) {
        return rates.savings * pct;
      } else if (fs.includes('variable')) {
        return rates.rate * pct;
      } else if (fs.includes('hybrid')) {
        return rates.rate * pct;
      }
      return 0; // Fixed = $0 estimated
    }

    // ── Process current month surgeries ───────────────────────────────
    // Count scheduled procedures per client for scale-up
    const clientSurgMap: Record<string, {
      scheduled: number;
      completedRev: number;
      name: string;
      feeStructure: string;
      carveOut: any;
      variablePct: number;
      categories: string[];
    }> = {};

    for (const s of surgeries) {
      const key = s.client_code;
      if (!clientSurgMap[key]) {
        clientSurgMap[key] = {
          scheduled: 0,
          completedRev: 0,
          name: s.care_hub_name || s.client_code,
          feeStructure: s.fee_structure || '',
          carveOut: s.carve_out,
          variablePct: parseFloat(s.variable_pct) || 0,
          categories: [],
        };
      }
      clientSurgMap[key].scheduled++;
      clientSurgMap[key].categories.push(s.category);
    }

    // Scale up scheduled procedures to EOM estimate
    // scheduledProcs / curveAtToday = estimated total month procs
    const clientProcEst: Record<string, number> = {};
    const clientRevEst: Record<string, number> = {};

    for (const [code, c] of Object.entries(clientSurgMap)) {
      const estTotal = Math.round(c.scheduled * scaleUpFactor);
      clientProcEst[code] = estTotal;

      // Estimate revenue for unscheduled procedures (estTotal - scheduled)
      const unscheduled = Math.max(0, estTotal - c.scheduled);
      // Use avg category from what's scheduled
      const catCounts: Record<string, number> = {};
      for (const cat of c.categories) {
        catCounts[cat] = (catCounts[cat] || 0) + 1;
      }
      let unscheduledRev = 0;
      for (const [cat, cnt] of Object.entries(catCounts)) {
        const catShare = cnt / c.categories.length;
        const catUnscheduled = unscheduled * catShare;
        unscheduledRev += estRevenue(cat, c.feeStructure, c.variablePct) * catUnscheduled;
      }
      clientRevEst[code] = unscheduledRev;
    }

    // ── Actual revenue aggregation ─────────────────────────────────────
    const sum = (rows: any[], field: string) =>
      rows.reduce((acc: number, r: any) => acc + (parseFloat(r[field]) || 0), 0);

    const curMonthActual = actual.filter((r: any) =>
      r.revenue_month?.startsWith(`${year}-${monthStr}`));
    const ytdActual = actual.filter((r: any) =>
      r.revenue_month?.startsWith(`${year}`));
    const curMonthBudget = budget.filter((r: any) =>
      r.revenue_month?.startsWith(`${year}-${monthStr}`));
    const ytdBudget = budget.filter((r: any) =>
      r.revenue_month?.startsWith(`${year}`));
    const pyMonthActual = actual.filter((r: any) =>
      r.revenue_month?.startsWith(`${year - 1}-${monthStr}`));
    const pyYtdActual = actual.filter((r: any) =>
      r.revenue_month?.startsWith(`${year - 1}`));

    const curMonthActRev = sum(curMonthActual, 'actual_revenue');
    const ytdRev = sum(ytdActual, 'actual_revenue');
    const curMonthBudRev = sum(curMonthBudget, 'surgery_care_revenue');
    const ytdBudRev = sum(ytdBudget, 'surgery_care_revenue');
    const pyMonthRev = sum(pyMonthActual, 'actual_revenue');
    const pyYtdRev = sum(pyYtdActual, 'actual_revenue');

    // Total estimated EOM revenue = actual so far + estimated unscheduled
    const totalEstUnscheduledRev = Object.values(clientRevEst)
      .reduce((a, b) => a + b, 0);
    const curMonthEomEst = curMonthActRev + totalEstUnscheduledRev;

    // Total estimated procedures this month
    const totalEstProcs = Object.values(clientProcEst)
      .reduce((a, b) => a + b, 0);

    // ── Build client map from actual revenues ──────────────────────────
    const clientMap: Record<string, any> = {};
    for (const r of actual) {
      const n = r.client_name;
      if (!clientMap[n]) clientMap[n] = {
        client_name: n,
        fee_structure: r.fee_structure || '—',
        carveout: carveoutLabel(r.carve_out),
        ees: parseFloat(r.ees) || null,
        vintage: r.go_live_date ? new Date(r.go_live_date).getFullYear() : null,
        ytd_rev: 0, cur_month_rev: 0, py_rev: 0,
        cur_month_est_rev: 0,
      };
      const rev = parseFloat(r.actual_revenue) || 0;
      if (r.revenue_month?.startsWith(`${year}`)) clientMap[n].ytd_rev += rev;
      if (r.revenue_month?.startsWith(`${year}-${monthStr}`)) clientMap[n].cur_month_rev += rev;
      if (r.revenue_month?.startsWith(`${year - 1}`)) clientMap[n].py_rev += rev;
    }

    // Add estimated unscheduled revenue to current month per client
    for (const [code, estRev] of Object.entries(clientRevEst)) {
      const name = clientSurgMap[code]?.name;
      if (name && clientMap[name]) {
        clientMap[name].cur_month_est_rev = estRev;
      }
    }

    // Budget per client
    const budClientMap: Record<string, number> = {};
    for (const r of budget) {
      if (r.revenue_month?.startsWith(`${year}`)) {
        budClientMap[r.client_name] = (budClientMap[r.client_name] || 0) +
          (parseFloat(r.surgery_care_revenue) || 0);
      }
    }

    // ── Build top50 ────────────────────────────────────────────────────
    const top50 = Object.values(clientMap)
      .map((c: any) => {
        const curMonthEom = c.cur_month_rev + c.cur_month_est_rev;
        const ytdPlusEst = c.ytd_rev + c.cur_month_est_rev;
        return {
          client_name: c.client_name,
          vintage: c.vintage,
          fee_structure: c.fee_structure,
          carveout: c.carveout,
          ees: c.ees,
          ytd_procedures_26: null,
          ytd_procedures_25: null,
          apr_revenue_26: Math.round(c.cur_month_rev / 1000),
          apr_eom_est: Math.round(curMonthEom / 1000),
          ytd_revenue_26: Math.round(ytdPlusEst / 1000),
          ytd_revenue_25: c.py_rev ? Math.round(c.py_rev / 1000) : null,
          ytd_vs_py_pct: c.py_rev
            ? parseFloat(((ytdPlusEst - c.py_rev) / c.py_rev * 100).toFixed(1))
            : null,
          ytd_vs_budget_pct: budClientMap[c.client_name]
            ? parseFloat(((ytdPlusEst - budClientMap[c.client_name]) /
                budClientMap[c.client_name] * 100).toFixed(1))
            : null,
        };
      })
      .sort((a: any, b: any) => (b.ytd_revenue_26 || 0) - (a.ytd_revenue_26 || 0))
      .slice(0, 50);

    const pyYtdRevTotal = pyYtdActual.reduce((a: number, r: any) =>
      a + (parseFloat(r.actual_revenue) || 0), 0);

    top50.push({
      client_name: 'Total Surgery Care Revenue',
      vintage: null, fee_structure: '—', carveout: '—', ees: null,
      ytd_procedures_26: totalEstProcs,
      ytd_procedures_25: null,
      apr_revenue_26: Math.round(curMonthActRev / 1000),
      apr_eom_est: Math.round(curMonthEomEst / 1000),
      ytd_revenue_26: Math.round((ytdRev + totalEstUnscheduledRev) / 1000),
      ytd_revenue_25: pyYtdRevTotal ? Math.round(pyYtdRevTotal / 1000) : null,
      ytd_vs_py_pct: pyYtdRevTotal
        ? parseFloat((((ytdRev + totalEstUnscheduledRev) - pyYtdRevTotal) /
            pyYtdRevTotal * 100).toFixed(1))
        : null,
      ytd_vs_budget_pct: ytdBudRev
        ? parseFloat((((ytdRev + totalEstUnscheduledRev) - ytdBudRev) /
            ytdBudRev * 100).toFixed(1))
        : null,
      is_total: true,
    });

    // ── Build cohort ───────────────────────────────────────────────────
    const cohort = inputs
      .filter((c: any) => c.cohort >= year - 1)
      .map((c: any) => {
        const rev = clientMap[c.care_hub_name];
        const curEom = rev
          ? (rev.cur_month_rev + rev.cur_month_est_rev)
          : 0;
        return {
          client_name: c.care_hub_name,
          go_live_date: c.modeling_go_live || c.contract_start_date,
          ees: c.ees,
          fee_structure: c.fee_structure || '—',
          carveout: carveoutLabel(c.carve_out),
          vintage: c.cohort,
          ytd_call_rate: null,
          eop_active_cases: null,
          ytd_procedures: null,
          apr_revenue: rev ? Math.round(rev.cur_month_rev / 1000) : 0,
          apr_eom_est: Math.round(curEom / 1000),
          ytd_revenue: rev
            ? Math.round((rev.ytd_rev + rev.cur_month_est_rev) / 1000)
            : 0,
          ytd_vs_budget_pct: null,
          ytd_vs_model_pct: null,
        };
      });

    return NextResponse.json({
      source: 'databricks',
      refreshedAt: new Date().toISOString(),
      meta: {
        business_day: currentBizDay,
        total_biz_days: totalBizDays,
        scale_factor: parseFloat(scaleUpFactor.toFixed(3)),
        curve_at_today: curveAtToday,
      },
      kpis: {
        apr_mtd_revenue: Math.round(curMonthActRev),
        apr_month_forecast: Math.round(curMonthEomEst),
        apr_mtd_procedures: surgeries.length,
        apr_proc_forecast: totalEstProcs,
        ytd_procedures: null,
        ytd_revenue: Math.round(ytdRev + totalEstUnscheduledRev),
        apr_mtd_revenue_vs_py: pyMonthRev
          ? parseFloat(((curMonthActRev - pyMonthRev) / pyMonthRev * 100).toFixed(1))
          : null,
        apr_month_forecast_vs_budget: curMonthBudRev
          ? parseFloat(((curMonthEomEst - curMonthBudRev) / curMonthBudRev * 100).toFixed(1))
          : null,
        apr_mtd_procedures_vs_py: null,
        apr_proc_forecast_vs_budget: null,
        ytd_procedures_vs_py: null,
        ytd_revenue_vs_py: pyYtdRev
          ? parseFloat((((ytdRev + totalEstUnscheduledRev) - pyYtdRev) /
              pyYtdRev * 100).toFixed(1))
          : null,
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