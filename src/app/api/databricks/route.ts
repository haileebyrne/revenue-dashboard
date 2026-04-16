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
    const monthStr = String(month).padStart(2, '0');

    const currentBizDay = businessDayOfMonth(now);
    const totalBizDays = businessDaysInMonth(year, month);
    const curveAtToday = SCHEDULING_CURVE[currentBizDay] || 0.85;
    const scaleUpFactor = curveAtToday > 0 ? 1 / curveAtToday : 1;

    const [actual, budget, inputs, surgeries] = await Promise.all([
      // Historical actual revenues
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

      // Client inputs - keyed by care_hub_name
      queryDatabricks(`
        SELECT care_hub_name, fee_structure, carve_out, ees, cohort,
               modeling_go_live, contract_start_date,
               variable_pct, variable_pct_2
        FROM sandboxwarehouse.growth_analytics.client_inputs
        WHERE care_hub_name IS NOT NULL
      `, 'client-inputs'),

      // Current month surgeries with revenue calculated inline
      // Join client_inputs via UPPER(client_code) = UPPER(care_hub_name) for fee structure
      // Use client_name directly to match actual_revenues
      queryDatabricks(`
        SELECT
          s.client_name,
          s.client_code,
          ci.care_hub_name,
          ci.fee_structure,
          ci.carve_out,
          ci.ees,
          ci.go_live_year,
          s.Requested_Procedure_Item_Category AS category,
          CASE
            WHEN LOWER(ci.fee_structure) LIKE '%savings%'
              THEN cpp_avg.avg_savings * CAST(ci.variable_pct_2 AS DOUBLE)
            WHEN LOWER(ci.fee_structure) LIKE '%variable%'
              THEN cpp_avg.avg_lantern_rate * CAST(ci.variable_pct AS DOUBLE)
            WHEN LOWER(ci.fee_structure) LIKE '%hybrid%'
              THEN cpp_avg.avg_lantern_rate * CAST(ci.variable_pct AS DOUBLE)
            ELSE 0
          END AS procedure_revenue
        FROM datawarehouse.core.member_surgeries s
        LEFT JOIN sandboxwarehouse.growth_analytics.client_inputs ci
          ON UPPER(s.client_code) = UPPER(ci.care_hub_name)
        LEFT JOIN (
          SELECT
            \`Carehub Category\` AS category,
            AVG(CAST(REPLACE(REPLACE(\`Case Rates Lantern\`, '$', ''), ',', '') AS DOUBLE)) AS avg_lantern_rate,
            AVG(CAST(REPLACE(REPLACE(\`Savings $\`, '$', ''), ',', '') AS DOUBLE)) AS avg_savings
          FROM sandboxwarehouse.growth_analytics.combined_procedure_pricing
          WHERE \`Carehub Category\` IS NOT NULL
            AND \`Case Rates Lantern\` IS NOT NULL
            AND \`Case Rates Lantern\` <> ''
          GROUP BY \`Carehub Category\`
        ) cpp_avg ON UPPER(s.Requested_Procedure_Item_Category) = UPPER(cpp_avg.category)
        WHERE YEAR(s.date_of_service) = ${year}
          AND MONTH(s.date_of_service) = ${month}
          AND s.requested_procedure_item_category <> 'INFUSION'
      `, 'cur-month-surgeries'),
    ]);

    // Aggregate surgeries by client_name (to match actual_revenues)
    // Also track client_code for care_hub_name lookup
    const surgByName: Record<string, {
      client_name: string; client_code: string; care_hub_name: string;
      fee_structure: string; carve_out: any; ees: any; go_live_year: any;
      scheduled: number; scheduled_rev: number;
    }> = {};

    for (const s of surgeries) {
      const key = s.client_name;
      if (!surgByName[key]) {
        surgByName[key] = {
          client_name: key,
          client_code: s.client_code,
          care_hub_name: s.care_hub_name || s.client_code,
          fee_structure: s.fee_structure || '—',
          carve_out: s.carve_out,
          ees: s.ees,
          go_live_year: s.go_live_year,
          scheduled: 0,
          scheduled_rev: 0,
        };
      }
      surgByName[key].scheduled++;
      surgByName[key].scheduled_rev += parseFloat(s.procedure_revenue) || 0;
    }

    // Scale up to EOM
    const surgEomRev: Record<string, number> = {};
    const surgEomProcs: Record<string, number> = {};
    for (const [name, c] of Object.entries(surgByName)) {
      surgEomRev[name] = c.scheduled_rev * scaleUpFactor;
      surgEomProcs[name] = Math.round(c.scheduled * scaleUpFactor);
    }

    const totalScheduledRev  = Object.values(surgByName).reduce((a, c) => a + c.scheduled_rev, 0);
    const totalEomRev        = totalScheduledRev * scaleUpFactor;
    const totalScheduledProcs = Object.values(surgByName).reduce((a, c) => a + c.scheduled, 0);
    const totalEomProcs      = Math.round(totalScheduledProcs * scaleUpFactor);

    // Aggregate actual revenues by client
    const actByName: Record<string, {
      fee_structure: string; carveout: string; ees: any;
      vintage: number | null; prior_rev: number; py_rev: number;
    }> = {};

    for (const r of actual) {
      const n = r.client_name;
      if (!actByName[n]) actByName[n] = {
        fee_structure: r.fee_structure || '—',
        carveout: carveoutLabel(r.carve_out),
        ees: parseFloat(r.ees) || null,
        vintage: r.go_live_date ? new Date(r.go_live_date).getFullYear() : null,
        prior_rev: 0, py_rev: 0,
      };
      const rev = parseFloat(r.actual_revenue) || 0;
      // Prior months of current year
      if (r.revenue_month?.startsWith(`${year}`) &&
          !r.revenue_month?.startsWith(`${year}-${monthStr}`)) {
        actByName[n].prior_rev += rev;
      }
      // Prior year
      if (r.revenue_month?.startsWith(`${year - 1}`)) actByName[n].py_rev += rev;
    }

    // Budget by client
    const budByName: Record<string, number> = {};
    for (const r of budget) {
      if (r.revenue_month?.startsWith(`${year}`)) {
        budByName[r.client_name] = (budByName[r.client_name] || 0) +
          (parseFloat(r.surgery_care_revenue) || 0);
      }
    }

    // Budget totals
    const curBudget  = budget.filter((r: any) => r.revenue_month?.startsWith(`${year}-${monthStr}`));
    const ytdBudget  = budget.filter((r: any) => r.revenue_month?.startsWith(`${year}`));
    const pyMonthAct = actual.filter((r: any) => r.revenue_month?.startsWith(`${year - 1}-${monthStr}`));
    const pyYtdAct   = actual.filter((r: any) => r.revenue_month?.startsWith(`${year - 1}`));
    const sum = (rows: any[], field: string) =>
      rows.reduce((acc: number, r: any) => acc + (parseFloat(r[field]) || 0), 0);
    const curBudRev  = sum(curBudget, 'surgery_care_revenue');
    const ytdBudRev  = sum(ytdBudget, 'surgery_care_revenue');
    const pyMonthRev = sum(pyMonthAct, 'actual_revenue');
    const pyYtdRev   = sum(pyYtdAct, 'actual_revenue');
    const priorMonthsTotal = Object.values(actByName).reduce((a, c) => a + c.prior_rev, 0);
    const ytdRevTotal = priorMonthsTotal + totalEomRev;

    // Merge all clients — union of actual_revenues clients and surgery clients
    const allClientNames = new Set([
      ...Object.keys(actByName),
      ...Object.keys(surgByName),
    ]);

    const allClients = Array.from(allClientNames).map(name => {
      const act  = actByName[name];
      const surg = surgByName[name];
      const aprMtd  = surg?.scheduled_rev || 0;
      const aprEom  = surgEomRev[name] || 0;
      const priorRev = act?.prior_rev || 0;
      const ytdEst  = priorRev + aprEom;
      const pyRev   = act?.py_rev || 0;
      return {
        client_name: name,
        vintage: act?.vintage ?? (surg?.go_live_year ? parseInt(surg.go_live_year) : null),
        fee_structure: act?.fee_structure ?? surg?.fee_structure ?? '—',
        carveout: act?.carveout ?? carveoutLabel(surg?.carve_out),
        ees: act?.ees ?? (surg?.ees ? parseInt(surg.ees) : null),
        ytd_procedures_26: surgEomProcs[name] || null,
        ytd_procedures_25: null,
        apr_revenue_26: Math.round(aprMtd / 1000),
        apr_eom_est: Math.round(aprEom / 1000),
        ytd_revenue_26: Math.round(ytdEst / 1000),
        ytd_revenue_25: pyRev ? Math.round(pyRev / 1000) : null,
        ytd_vs_py_pct: pyRev
          ? parseFloat(((ytdEst - pyRev) / pyRev * 100).toFixed(1))
          : null,
        ytd_vs_budget_pct: budByName[name]
          ? parseFloat(((ytdEst - budByName[name]) / budByName[name] * 100).toFixed(1))
          : null,
      };
    }).sort((a: any, b: any) => (b.ytd_revenue_26 || 0) - (a.ytd_revenue_26 || 0));

    // Total row — always at bottom
    const totalRow = {
      client_name: 'Total Surgery Care Revenue',
      vintage: null, fee_structure: '—', carveout: '—', ees: null,
      ytd_procedures_26: totalEomProcs, ytd_procedures_25: null,
      apr_revenue_26: Math.round(totalScheduledRev / 1000),
      apr_eom_est: Math.round(totalEomRev / 1000),
      ytd_revenue_26: Math.round(ytdRevTotal / 1000),
      ytd_revenue_25: pyYtdRev ? Math.round(pyYtdRev / 1000) : null,
      ytd_vs_py_pct: pyYtdRev
        ? parseFloat(((ytdRevTotal - pyYtdRev) / pyYtdRev * 100).toFixed(1))
        : null,
      ytd_vs_budget_pct: ytdBudRev
        ? parseFloat(((ytdRevTotal - ytdBudRev) / ytdBudRev * 100).toFixed(1))
        : null,
      is_total: true,
    };

    // Top 50 by YTD revenue
    const top50 = [...allClients]
      .filter(r => !r.is_total)
      .slice(0, 50)
      .concat([totalRow]);

    // All clients with total at bottom
    const allWithTotal = [...allClients, totalRow];

    // Cohort from client_inputs — filter by vintage in dashboard
    const cohort = inputs.map((c: any) => {
      const name = c.care_hub_name;
      const surg = surgByName[name];
      // Try to match to actual_revenues by finding closest name
      const actMatch = actByName[name] ||
        Object.entries(actByName).find(([k]) =>
          k.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(k.toLowerCase())
        )?.[1];

      const aprMtd  = surg?.scheduled_rev || 0;
      const aprEom  = surgEomRev[name] || 0;
      const priorRev = actMatch?.prior_rev || 0;
      const ytdEst  = priorRev + aprEom;

      return {
        client_name: name,
        go_live_date: c.modeling_go_live || c.contract_start_date,
        ees: c.ees,
        fee_structure: c.fee_structure || '—',
        carveout: carveoutLabel(c.carve_out),
        vintage: c.cohort,
        ytd_call_rate: null,
        eop_active_cases: null,
        ytd_procedures: surgEomProcs[name] || null,
        apr_revenue: Math.round(aprMtd / 1000),
        apr_eom_est: Math.round(aprEom / 1000),
        ytd_revenue: Math.round(ytdEst / 1000),
        ytd_vs_budget_pct: null,
        ytd_vs_model_pct: null,
      };
    }).sort((a: any, b: any) => (b.ytd_revenue || 0) - (a.ytd_revenue || 0));

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
        apr_mtd_revenue: Math.round(totalScheduledRev),
        apr_month_forecast: Math.round(totalEomRev),
        apr_mtd_procedures: totalScheduledProcs,
        apr_proc_forecast: totalEomProcs,
        ytd_procedures: totalEomProcs,
        ytd_revenue: Math.round(ytdRevTotal),
        apr_mtd_revenue_vs_py: pyMonthRev
          ? parseFloat(((totalScheduledRev - pyMonthRev) / pyMonthRev * 100).toFixed(1))
          : null,
        apr_month_forecast_vs_budget: curBudRev
          ? parseFloat(((totalEomRev - curBudRev) / curBudRev * 100).toFixed(1))
          : null,
        apr_mtd_procedures_vs_py: null,
        apr_proc_forecast_vs_budget: null,
        ytd_procedures_vs_py: null,
        ytd_revenue_vs_py: pyYtdRev
          ? parseFloat(((ytdRevTotal - pyYtdRev) / pyYtdRev * 100).toFixed(1))
          : null,
      },
      top50: allWithTotal,
      top50_only: top50,
      cohort,
    });

  } catch (error: any) {
    console.error('Dashboard API error:', error);
    const { FALLBACK_DATA } = await import('@/lib/fallback');
    return NextResponse.json({ ...FALLBACK_DATA, error: error.message });
  }
}
