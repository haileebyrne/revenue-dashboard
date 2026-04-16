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
      // Historical actual revenues (prior months)
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
               modeling_go_live, contract_start_date,
               variable_pct, variable_pct_2
        FROM sandboxwarehouse.growth_analytics.client_inputs
        WHERE care_hub_name IS NOT NULL
      `, 'client-inputs'),

      // Current month surgeries with revenue calculated inline
      queryDatabricks(`
        SELECT
          s.client_code,
          s.client_name,
          ci.care_hub_name,
          ci.fee_structure,
          ci.carve_out,
          s.Requested_Procedure_Item_Category AS category,
          CASE
            WHEN LOWER(ci.fee_structure) LIKE '%savings%'
              THEN cpp_avg.avg_savings * ci.variable_pct_2
            WHEN LOWER(ci.fee_structure) LIKE '%variable%'
              THEN cpp_avg.avg_lantern_rate * ci.variable_pct
            WHEN LOWER(ci.fee_structure) LIKE '%hybrid%'
              THEN cpp_avg.avg_lantern_rate * ci.variable_pct
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

    // Aggregate current month surgery revenue by client
    const clientSurgMap: Record<string, {
      name: string; scheduled: number; scheduledRev: number;
      feeStructure: string; carveOut: any;
    }> = {};

    for (const s of surgeries) {
      const key = s.care_hub_name || s.client_name || s.client_code;
      if (!clientSurgMap[key]) {
        clientSurgMap[key] = {
          name: key, scheduled: 0, scheduledRev: 0,
          feeStructure: s.fee_structure || '',
          carveOut: s.carve_out,
        };
      }
      clientSurgMap[key].scheduled++;
      clientSurgMap[key].scheduledRev += parseFloat(s.procedure_revenue) || 0;
    }

    // Scale up scheduled revenue to EOM estimate using scheduling curve
    // scheduledRev / curveAtToday = estimated full month revenue
    const clientEomEst: Record<string, number> = {};
    for (const [key, c] of Object.entries(clientSurgMap)) {
      clientEomEst[key] = c.scheduledRev * scaleUpFactor;
    }

    const totalScheduledRev = Object.values(clientSurgMap).reduce((a, c) => a + c.scheduledRev, 0);
    const totalEomEst = totalScheduledRev * scaleUpFactor;
    const totalScheduledProcs = Object.values(clientSurgMap).reduce((a, c) => a + c.scheduled, 0);
    const totalEomProcs = Math.round(totalScheduledProcs * scaleUpFactor);

    // Aggregate historical actual revenues
    const sum = (rows: any[], field: string) =>
      rows.reduce((acc: number, r: any) => acc + (parseFloat(r[field]) || 0), 0);

    // YTD = prior months actual + current month EOM estimate
    const priorMonthsActual = actual.filter((r: any) =>
      r.revenue_month?.startsWith(`${year}`) &&
      !r.revenue_month?.startsWith(`${year}-${monthStr}`)
    );
    const curMonthActual = actual.filter((r: any) =>
      r.revenue_month?.startsWith(`${year}-${monthStr}`)
    );
    const curBudget  = budget.filter((r: any) => r.revenue_month?.startsWith(`${year}-${monthStr}`));
    const ytdBudget  = budget.filter((r: any) => r.revenue_month?.startsWith(`${year}`));
    const pyMonthAct = actual.filter((r: any) => r.revenue_month?.startsWith(`${year - 1}-${monthStr}`));
    const pyYtdAct   = actual.filter((r: any) => r.revenue_month?.startsWith(`${year - 1}`));

    const priorActRev  = sum(priorMonthsActual, 'actual_revenue');
    const curActRev    = sum(curMonthActual, 'actual_revenue'); // usually 0 until invoiced
    const curBudRev    = sum(curBudget, 'surgery_care_revenue');
    const ytdBudRev    = sum(ytdBudget, 'surgery_care_revenue');
    const pyMonthRev   = sum(pyMonthAct, 'actual_revenue');
    const pyYtdRev     = sum(pyYtdAct, 'actual_revenue');

    // Apr MTD = scheduled procedures revenue so far
    const aprMtdRev = totalScheduledRev;
    // Apr EOM = scaled up to full month
    const aprEomRev = totalEomEst;
    // YTD = prior months actual + current month EOM estimate
    const ytdRevTotal = priorActRev + aprEomRev;

    // Build client map from actual revenues (prior months)
    const clientMap: Record<string, any> = {};
    for (const r of actual) {
      const n = r.client_name;
      if (!clientMap[n]) clientMap[n] = {
        client_name: n,
        fee_structure: r.fee_structure || '—',
        carveout: carveoutLabel(r.carve_out),
        ees: parseFloat(r.ees) || null,
        vintage: r.go_live_date ? new Date(r.go_live_date).getFullYear() : null,
        prior_rev: 0, py_rev: 0,
      };
      const rev = parseFloat(r.actual_revenue) || 0;
      if (r.revenue_month?.startsWith(`${year}`) &&
          !r.revenue_month?.startsWith(`${year}-${monthStr}`)) {
        clientMap[n].prior_rev += rev;
      }
      if (r.revenue_month?.startsWith(`${year - 1}`)) clientMap[n].py_rev += rev;
    }

    // Also add clients that only appear in surgeries (new 2026 clients)
    for (const [key, c] of Object.entries(clientSurgMap)) {
      if (!clientMap[key]) {
        clientMap[key] = {
          client_name: key,
          fee_structure: c.feeStructure || '—',
          carveout: carveoutLabel(c.carveOut),
          ees: null, vintage: null,
          prior_rev: 0, py_rev: 0,
        };
      }
    }

    const budClientMap: Record<string, number> = {};
    for (const r of budget) {
      if (r.revenue_month?.startsWith(`${year}`)) {
        budClientMap[r.client_name] = (budClientMap[r.client_name] || 0) +
          (parseFloat(r.surgery_care_revenue) || 0);
      }
    }

    // Build all clients list
    const allClients = Object.values(clientMap).map((c: any) => {
      const aprMtd  = clientSurgMap[c.client_name]?.scheduledRev || 0;
      const aprEom  = clientEomEst[c.client_name] || 0;
      const ytdEst  = c.prior_rev + aprEom;
      return {
        client_name: c.client_name,
        vintage: c.vintage,
        fee_structure: c.fee_structure,
        carveout: c.carveout,
        ees: c.ees,
        ytd_procedures_26: clientSurgMap[c.client_name]
          ? Math.round(clientSurgMap[c.client_name].scheduled * scaleUpFactor)
          : null,
        ytd_procedures_25: null,
        apr_revenue_26: Math.round(aprMtd / 1000),
        apr_eom_est: Math.round(aprEom / 1000),
        ytd_revenue_26: Math.round(ytdEst / 1000),
        ytd_revenue_25: c.py_rev ? Math.round(c.py_rev / 1000) : null,
        ytd_vs_py_pct: c.py_rev
          ? parseFloat(((ytdEst - c.py_rev) / c.py_rev * 100).toFixed(1))
          : null,
        ytd_vs_budget_pct: budClientMap[c.client_name]
          ? parseFloat(((ytdEst - budClientMap[c.client_name]) / budClientMap[c.client_name] * 100).toFixed(1))
          : null,
      };
    }).sort((a: any, b: any) => (b.ytd_revenue_26 || 0) - (a.ytd_revenue_26 || 0));

    const totalRow = {
      client_name: 'Total Surgery Care Revenue',
      vintage: null, fee_structure: '—', carveout: '—', ees: null,
      ytd_procedures_26: totalEomProcs,
      ytd_procedures_25: null,
      apr_revenue_26: Math.round(aprMtdRev / 1000),
      apr_eom_est: Math.round(aprEomRev / 1000),
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

    const top50 = [...allClients].slice(0, 50).concat([totalRow]);
    const allWithTotal = [...allClients, totalRow];

    // Cohort
    const cohort = inputs.map((c: any) => {
      const surgKey = c.care_hub_name;
      const rev = clientMap[surgKey];
      const aprMtd = clientSurgMap[surgKey]?.scheduledRev || 0;
      const aprEom = clientEomEst[surgKey] || 0;
      const ytdEst = (rev?.prior_rev || 0) + aprEom;
      return {
        client_name: c.care_hub_name,
        go_live_date: c.modeling_go_live || c.contract_start_date,
        ees: c.ees,
        fee_structure: c.fee_structure || '—',
        carveout: carveoutLabel(c.carve_out),
        vintage: c.cohort,
        ytd_call_rate: null,
        eop_active_cases: null,
        ytd_procedures: clientSurgMap[surgKey]
          ? Math.round(clientSurgMap[surgKey].scheduled * scaleUpFactor)
          : null,
        apr_revenue: Math.round(aprMtd / 1000),
        apr_eom_est: Math.round(aprEom / 1000),
        ytd_revenue: Math.round(ytdEst / 1000),
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
        apr_mtd_revenue: Math.round(aprMtdRev),
        apr_month_forecast: Math.round(aprEomRev),
        apr_mtd_procedures: totalScheduledProcs,
        apr_proc_forecast: totalEomProcs,
        ytd_procedures: totalEomProcs,
        ytd_revenue: Math.round(ytdRevTotal),
        apr_mtd_revenue_vs_py: pyMonthRev
          ? parseFloat(((aprMtdRev - pyMonthRev) / pyMonthRev * 100).toFixed(1))
          : null,
        apr_month_forecast_vs_budget: curBudRev
          ? parseFloat(((aprEomRev - curBudRev) / curBudRev * 100).toFixed(1))
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
