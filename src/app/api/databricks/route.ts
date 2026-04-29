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
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    const currentBizDay = businessDayOfMonth(now);
    const totalBizDays = businessDaysInMonth(year, month);
    const curveAtToday = SCHEDULING_CURVE[currentBizDay] || 0.85;
    const scaleUpFactor = curveAtToday > 0 ? 1 / curveAtToday : 1;

    const [actual, budget, inputs, curSurgeries, ytdSurgeries, priorSurgeries, otherRevenues, funnel] = await Promise.all([

      // Actual revenues (all historical)
      queryDatabricks(
        'SELECT client_name, fee_structure, carve_out, ees, go_live_date, revenue_month, actual_revenue FROM sandboxwarehouse.growth_analytics.actual_revenues',
        'actual-rev'
      ),

      // Budget revenues
      queryDatabricks(
        'SELECT client_name, revenue_month, surgery_care_revenue, cohort, fee_structure, carve_out, ees FROM sandboxwarehouse.growth_analytics.budgeted_revenues',
        'budget-rev'
      ),

      // Client inputs
      queryDatabricks(
        'SELECT care_hub_name, client, fee_structure, carve_out, ees, cohort, modeling_go_live, contract_start_date, variable_pct, variable_pct_2 FROM sandboxwarehouse.growth_analytics.client_inputs WHERE care_hub_name IS NOT NULL',
        'client-inputs'
      ),

      // Current month surgeries with revenue
      queryDatabricks(
        `SELECT s.client_name, s.client_code, ci.care_hub_name, ci.fee_structure, ci.carve_out, ci.ees, s.Requested_Procedure_Item_Category AS category,
          CASE
            WHEN LOWER(ci.fee_structure) LIKE '%savings%' THEN cpp.avg_savings * CAST(ci.variable_pct_2 AS DOUBLE)
            WHEN LOWER(ci.fee_structure) LIKE '%variable%' THEN cpp.avg_lantern_rate * CAST(ci.variable_pct AS DOUBLE)
            WHEN LOWER(ci.fee_structure) LIKE '%hybrid%' THEN cpp.avg_lantern_rate * CAST(ci.variable_pct AS DOUBLE)
            ELSE 0
          END AS procedure_revenue
        FROM datawarehouse.core.member_surgeries s
        LEFT JOIN sandboxwarehouse.growth_analytics.client_inputs ci ON UPPER(s.client_code) = UPPER(ci.care_hub_name)
        LEFT JOIN (
          SELECT \`Carehub Category\` AS cat,
            AVG(CAST(REPLACE(REPLACE(\`Case Rates Lantern\`,'$',''),',','') AS DOUBLE)) AS avg_lantern_rate,
            AVG(CAST(REPLACE(REPLACE(\`Savings $\`,'$',''),',','') AS DOUBLE)) AS avg_savings
          FROM sandboxwarehouse.growth_analytics.combined_procedure_pricing
          WHERE \`Carehub Category\` IS NOT NULL AND \`Case Rates Lantern\` IS NOT NULL AND \`Case Rates Lantern\` <> ''
          GROUP BY \`Carehub Category\`
        ) cpp ON UPPER(s.Requested_Procedure_Item_Category) = UPPER(cpp.cat)
        WHERE YEAR(s.date_of_service) = ${year} AND MONTH(s.date_of_service) = ${month}
          AND s.requested_procedure_item_category <> 'INFUSION'`,
        'cur-surgeries'
      ),

      // YTD surgeries by client and month (Jan through current month)
      queryDatabricks(
        `SELECT client_name, MONTH(date_of_service) AS m, COUNT(DISTINCT service_id) AS proc_count
        FROM datawarehouse.core.member_surgeries
        WHERE YEAR(date_of_service) = ${year} AND MONTH(date_of_service) < ${month}
          AND requested_procedure_item_category <> 'INFUSION'
        GROUP BY client_name, MONTH(date_of_service)`,
        'ytd-surgeries'
      ),

      // Prior year YTD surgeries by client and month
      queryDatabricks(
        `SELECT client_name, MONTH(date_of_service) AS m, COUNT(DISTINCT service_id) AS proc_count
        FROM datawarehouse.core.member_surgeries
        WHERE YEAR(date_of_service) = ${year - 1} AND MONTH(date_of_service) <= ${month}
          AND requested_procedure_item_category <> 'INFUSION'
        GROUP BY client_name, MONTH(date_of_service)`,
        'prior-surgeries'
      ),

      // Other revenues (fixed fee, PEPM, etc.) for MTD Performance
      queryDatabricks(
        `SELECT revenue_month, revenue_type, category, amount, data_type
        FROM sandboxwarehouse.growth_analytics.other_revenues`,
        'other-rev'
      ),

      // Full Funnel data for cohort tab
      queryDatabricks(
        `WITH all_cases AS (
          SELECT * FROM datawarehouse.core.member_case_detail
          WHERE product_name <> 'Hinge Health'
            AND (case_status NOT IN ('Closed','Void') OR case_closed_date >= date_trunc('YEAR', add_months(current_date(), -12)))
        )
        SELECT
          client_code,
          COUNT(DISTINCT CASE WHEN case_closed_reason_category NOT IN ('Provider Inquiry','General Benefit Inquiry','Lost Case - First Call') OR case_closed_reason_category IS NULL THEN member_case_id END) AS ytd_first_calls,
          COUNT(DISTINCT CASE WHEN case_closed_reason_category NOT IN ('Provider Inquiry','General Benefit Inquiry','Lost Case - First Call') OR case_closed_reason_category IS NULL THEN member_case_id END) AS ytd_new_cases,
          COUNT(DISTINCT CASE WHEN (case_closed_date IS NULL OR case_closed_date > current_date()) AND case_status NOT IN ('Closed','Void') THEN member_case_id END) AS eop_active_cases,
          COUNT(DISTINCT CASE WHEN first_consult_date IS NOT NULL OR first_surgery_date IS NOT NULL OR case_closed_reason_category IN ('Case Complete','Avoided Procedure') THEN member_case_id END) AS ytd_consults
        FROM all_cases
        WHERE YEAR(case_created_date) = ${year}
        GROUP BY client_code`,
        'funnel-data'
      ),
    ]);

    // Robust revenue_month parser — handles "2026-01", "2026-01-01", "2026-1-1", timestamps, etc.
    function parseYearMonth(raw: any): { ry: number; rm: number } | null {
      if (!raw) return null;
      const s = String(raw).trim();
      // Try "YYYY-MM..." format first
      const m = s.match(/^(\d{4})[^0-9](\d{1,2})/);
      if (m) return { ry: parseInt(m[1]), rm: parseInt(m[2]) };
      // Try Date parse as fallback
      const d = new Date(s);
      if (!isNaN(d.getTime())) return { ry: d.getFullYear(), rm: d.getMonth() + 1 };
      return null;
    }

    // Robust revenue parser — handles "1,194", "(26,500)", "$1,234", null, etc.
    function parseRevenue(raw: any): number {
      if (!raw) return 0;
      const s = String(raw).trim();
      const negative = s.startsWith('(') && s.endsWith(')');
      const cleaned = s.replace(/[$,()]/g, '');
      const val = parseFloat(cleaned);
      if (isNaN(val)) return 0;
      return negative ? -val : val;
    }

    // Build funnel lookup by client_code
    const funnelByCode: Record<string, any> = {};
    for (const f of funnel) {
      funnelByCode[f.client_code?.toUpperCase()] = f;
    }

    // Build monthly proc maps
    // ytdProcByClient[name][month] = count
    const ytdProcByClient: Record<string, Record<number, number>> = {};
    for (const r of ytdSurgeries) {
      const n = r.client_name;
      if (!ytdProcByClient[n]) ytdProcByClient[n] = {};
      ytdProcByClient[n][parseInt(r.m)] = parseInt(r.proc_count) || 0;
    }
    const priorProcByClient: Record<string, Record<number, number>> = {};
    const priorProcByName: Record<string, number> = {};
    for (const r of priorSurgeries) {
      const n = r.client_name;
      if (!priorProcByClient[n]) priorProcByClient[n] = {};
      priorProcByClient[n][parseInt(r.m)] = parseInt(r.proc_count) || 0;
      priorProcByName[n] = (priorProcByName[n] || 0) + (parseInt(r.proc_count) || 0);
    }

    // YTD prior months proc totals per client
    const ytdPriorMonthsProcs: Record<string, number> = {};
    for (const [name, months] of Object.entries(ytdProcByClient)) {
      ytdPriorMonthsProcs[name] = Object.values(months).reduce((a, b) => a + b, 0);
    }

    // Current month surgeries aggregation
    const surgByName: Record<string, { client_code: string; care_hub_name: string; fee_structure: string; carve_out: any; ees: any; scheduled: number; scheduled_rev: number }> = {};
    for (const s of curSurgeries) {
      const key = s.client_name;
      if (!surgByName[key]) {
        surgByName[key] = { client_code: s.client_code, care_hub_name: s.care_hub_name || s.client_code, fee_structure: s.fee_structure || '—', carve_out: s.carve_out, ees: s.ees, scheduled: 0, scheduled_rev: 0 };
      }
      surgByName[key].scheduled++;
      surgByName[key].scheduled_rev += parseFloat(s.procedure_revenue) || 0;
    }

    const surgEomRev: Record<string, number> = {};
    const surgEomProcs: Record<string, number> = {};
    for (const [name, c] of Object.entries(surgByName)) {
      surgEomRev[name] = c.scheduled_rev * scaleUpFactor;
      surgEomProcs[name] = Math.round(c.scheduled * scaleUpFactor);
    }

    const totalScheduledRev = Object.values(surgByName).reduce((a, c) => a + c.scheduled_rev, 0);
    const totalEomRev = totalScheduledRev * scaleUpFactor;
    const totalScheduledProcs = Object.values(surgByName).reduce((a, c) => a + c.scheduled, 0);
    const totalEomProcs = Math.round(totalScheduledProcs * scaleUpFactor);
    const totalPriorProcs = Object.values(priorProcByName).reduce((a, b) => a + b, 0);

    // Actual revenues aggregation
    const actByName: Record<string, { fee_structure: string; carveout: string; ees: any; vintage: number | null; prior_rev: number; py_rev: number; monthly_rev: Record<number, number>; py_monthly_rev: Record<number, number> }> = {};
    for (const r of actual) {
      const n = r.client_name;
      if (!actByName[n]) {
        actByName[n] = { fee_structure: r.fee_structure || '—', carveout: carveoutLabel(r.carve_out), ees: parseFloat(r.ees) || null, vintage: r.go_live_date ? new Date(r.go_live_date).getFullYear() : null, prior_rev: 0, py_rev: 0, monthly_rev: {}, py_monthly_rev: {} };
      }
      const rev = parseRevenue(r.actual_revenue);
      const parsed = parseYearMonth(r.revenue_month);
      if (!parsed) continue;
      const { ry, rm } = parsed;
      if (ry === year && rm < month) {
        actByName[n].prior_rev += rev;
        actByName[n].monthly_rev[Number(rm)] = (actByName[n].monthly_rev[Number(rm)] || 0) + rev;
      }
      if (ry === year - 1) {
        actByName[n].py_rev += rev;
        actByName[n].py_monthly_rev[rm] = (actByName[n].py_monthly_rev[rm] || 0) + rev;
      }
    }

    // Budget aggregation
    const budByName: Record<string, number> = {};        // YTD budget per client
    const fullYearBudByName: Record<string, number> = {}; // Full year budget (for Top 50)
    let curBudRev = 0; let ytdBudRev = 0;
    for (const r of budget) {
      const rev = parseFloat(r.surgery_care_revenue) || 0;
      const parsed = parseYearMonth(r.revenue_month);
      if (!parsed) continue;
      const { ry, rm } = parsed;
      if (ry === year) {
        ytdBudRev += rev;
        if (rm === month) curBudRev += rev;
        if (rm <= month) {
          budByName[r.client_name] = (budByName[r.client_name] || 0) + rev;
        }
        if (r.fee_structure !== 'Fixed') {
          fullYearBudByName[r.client_name] = (fullYearBudByName[r.client_name] || 0) + rev;
        }
      }
    }

    let pyMonthRev = 0; let pyYtdRev = 0;
    for (const r of actual) {
      const rev = parseRevenue(r.actual_revenue);
      const parsed = parseYearMonth(r.revenue_month);
      if (!parsed) continue;
      const { ry, rm } = parsed;
      if (ry === year - 1 && rm === month) pyMonthRev += rev;
      if (ry === year - 1) pyYtdRev += rev;
    }

    const priorMonthsTotal = Object.values(actByName).reduce((a, c) => a + c.prior_rev, 0);
    const ytdRevTotal = priorMonthsTotal + totalEomRev;

    // Build all clients
    const allClientNames = new Set([...Object.keys(actByName), ...Object.keys(surgByName)]);

    const allClients = Array.from(allClientNames).map(name => {
      const act   = actByName[name];
      const surg  = surgByName[name];
      const aprMtd  = surg?.scheduled_rev || 0;
      const aprEom  = surgEomRev[name] || 0;
      const priorRev = act?.prior_rev || 0;
      const ytdEst  = priorRev + aprEom;
      const pyRev   = act?.py_rev || 0;
      const ytdActProcs = ytdPriorMonthsProcs[name] || 0;
      const ytdEomProcs26 = ytdActProcs + (surgEomProcs[name] || 0);
      const ytdProcs25 = priorProcByName[name] || null;

      // Monthly proc arrays [jan, feb, mar, apr_est]
      const procs26 = [1,2,3].map(m => ytdProcByClient[name]?.[m] ?? null);
      const aprEomProcEst = surgEomProcs[name] || 0;
      const procs25 = [1,2,3,4].map(m => priorProcByClient[name]?.[m] ?? null);

      // Monthly revenue arrays
      const rev26 = [1,2,3].map(m => (act?.monthly_rev?.[m] != null && act.monthly_rev[m] !== 0) ? Math.round(act.monthly_rev[m] / 1000) : null);
      const rev25 = [1,2,3,4].map(m => (act?.py_monthly_rev?.[m] != null && act.py_monthly_rev[m] !== 0) ? Math.round(act.py_monthly_rev[m] / 1000) : null);
      const aprRevEst = Math.round(aprEom / 1000);

      const avgRevPerProc = ytdEomProcs26 > 0 ? Math.round(ytdEst / ytdEomProcs26) : null;

      return {
        client_name: name,
        vintage: act?.vintage ?? null,
        fee_structure: act?.fee_structure ?? surg?.fee_structure ?? '—',
        carveout: act?.carveout ?? carveoutLabel(surg?.carve_out),
        ees: (surg?.ees ? parseInt(surg.ees) : null) ?? (act?.ees ? act.ees * 1000 : null),
        // Procedures
        procs26_jan: procs26[0], procs26_feb: procs26[1], procs26_mar: procs26[2],
        procs26_apr_mtd: surg?.scheduled || null,
        procs26_apr_est: aprEomProcEst || null,
        procs26_ytd: ytdEomProcs26 || null,
        procs25_jan: procs25[0], procs25_feb: procs25[1], procs25_mar: procs25[2], procs25_apr: procs25[3],
        procs25_ytd: ytdProcs25,
        // Revenue
        rev26_jan: rev26[0], rev26_feb: rev26[1], rev26_mar: rev26[2],
        rev26_apr_mtd: Math.round(aprMtd / 1000),
        rev26_apr_est: aprRevEst,
        rev26_ytd: Math.round(ytdEst / 1000),
        rev25_jan: rev25[0], rev25_feb: rev25[1], rev25_mar: rev25[2], rev25_apr: rev25[3],
        rev25_ytd: pyRev ? Math.round(pyRev / 1000) : null,
        // Diffs
        avg_rev_per_proc: avgRevPerProc,
        ytd_vs_py_pct: pyRev ? parseFloat(((ytdEst - pyRev) / pyRev * 100).toFixed(1)) : null,
        ytd_vs_budget_pct: budByName[name] ? parseFloat(((ytdEst - budByName[name]) / budByName[name] * 100).toFixed(1)) : null,
        // Legacy fields for compatibility
        ytd_procedures_26: ytdEomProcs26 || null,
        ytd_procedures_25: ytdProcs25,
        apr_revenue_26: Math.round(aprMtd / 1000),
        apr_eom_est: aprRevEst,
        ytd_revenue_26: Math.round(ytdEst / 1000),
        ytd_revenue_25: pyRev ? Math.round(pyRev / 1000) : null,
      };
    }).sort((a: any, b: any) => (b.ytd_revenue_26 || 0) - (a.ytd_revenue_26 || 0));

    // Total row — sum monthly actuals from actByName
    const totalYtdActProcs = Object.values(ytdPriorMonthsProcs).reduce((a, b) => a + b, 0);
    const totalMonthlyRev: Record<number, number> = {};
    const totalPyMonthlyRev: Record<number, number> = {};
    for (const act of Object.values(actByName)) {
      for (const [m, v] of Object.entries(act.monthly_rev)) {
        totalMonthlyRev[Number(m)] = (totalMonthlyRev[Number(m)] || 0) + v;
      }
      for (const [m, v] of Object.entries(act.py_monthly_rev)) {
        totalPyMonthlyRev[Number(m)] = (totalPyMonthlyRev[Number(m)] || 0) + v;
      }
    }
    const totalRow: any = {
      client_name: 'Total Surgery Care Revenue', vintage: null, fee_structure: '—', carveout: '—', ees: null,
      procs26_jan: Object.values(ytdProcByClient).reduce((a,c) => a+(c[1]||0),0) || null,
      procs26_feb: Object.values(ytdProcByClient).reduce((a,c) => a+(c[2]||0),0) || null,
      procs26_mar: Object.values(ytdProcByClient).reduce((a,c) => a+(c[3]||0),0) || null,
      procs26_apr_mtd: totalScheduledProcs, procs26_apr_est: totalEomProcs,
      procs26_ytd: totalYtdActProcs + totalEomProcs,
      procs25_jan: Object.values(priorProcByClient).reduce((a,c) => a+(c[1]||0),0) || null,
      procs25_feb: Object.values(priorProcByClient).reduce((a,c) => a+(c[2]||0),0) || null,
      procs25_mar: Object.values(priorProcByClient).reduce((a,c) => a+(c[3]||0),0) || null,
      procs25_apr: Object.values(priorProcByClient).reduce((a,c) => a+(c[4]||0),0) || null,
      procs25_ytd: totalPriorProcs || null,
      rev26_jan: totalMonthlyRev[1] ? Math.round(totalMonthlyRev[1] / 1000) : null,
      rev26_feb: totalMonthlyRev[2] ? Math.round(totalMonthlyRev[2] / 1000) : null,
      rev26_mar: totalMonthlyRev[3] ? Math.round(totalMonthlyRev[3] / 1000) : null,
      rev26_apr_mtd: Math.round(totalScheduledRev / 1000),
      rev26_apr_est: Math.round(totalEomRev / 1000),
      rev26_ytd: Math.round(ytdRevTotal / 1000),
      rev25_jan: totalPyMonthlyRev[1] ? Math.round(totalPyMonthlyRev[1] / 1000) : null,
      rev25_feb: totalPyMonthlyRev[2] ? Math.round(totalPyMonthlyRev[2] / 1000) : null,
      rev25_mar: totalPyMonthlyRev[3] ? Math.round(totalPyMonthlyRev[3] / 1000) : null,
      rev25_apr: totalPyMonthlyRev[4] ? Math.round(totalPyMonthlyRev[4] / 1000) : null,
      rev25_ytd: pyYtdRev ? Math.round(pyYtdRev / 1000) : null,
      ytd_procedures_26: totalYtdActProcs + totalEomProcs,
      ytd_procedures_25: totalPriorProcs || null,
      apr_revenue_26: Math.round(totalScheduledRev / 1000),
      apr_eom_est: Math.round(totalEomRev / 1000),
      ytd_revenue_26: Math.round(ytdRevTotal / 1000),
      ytd_revenue_25: pyYtdRev ? Math.round(pyYtdRev / 1000) : null,
      ytd_vs_py_pct: pyYtdRev ? parseFloat(((ytdRevTotal - pyYtdRev) / pyYtdRev * 100).toFixed(1)) : null,
      ytd_vs_budget_pct: ytdBudRev ? parseFloat(((ytdRevTotal - ytdBudRev) / ytdBudRev * 100).toFixed(1)) : null,
      is_total: true,
    };

    const top50 = [...allClients]
      .filter((r: any) => r.fee_structure !== 'Fixed')
      .sort((a: any, b: any) => (fullYearBudByName[b.client_name] || 0) - (fullYearBudByName[a.client_name] || 0))
      .slice(0, 50)
      .concat([totalRow]);
    const allWithTotal = [...allClients, totalRow];

    // Helper to format date fields to YYYY-MM-DD
    function fmtDate(raw: any): string | null {
      if (!raw) return null;
      try {
        const d = new Date(raw);
        if (isNaN(d.getTime())) return null;
        return d.toISOString().substring(0, 10);
      } catch { return null; }
    }

    // Cohort — only 2026 vintage clients
    const cohort = inputs
      .filter((c: any) => String(c.cohort) === '2026')
      .map((c: any) => {
        const code = c.care_hub_name;
        const name = c.client || code;
        const surg  = surgByName[name] || surgByName[code];
        const act   = actByName[name] || actByName[code] || Object.entries(actByName).find(([k]) =>
          k.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(k.toLowerCase())
        )?.[1];
        const funnelData = funnelByCode[code?.toUpperCase()] || funnelByCode[surg?.client_code?.toUpperCase()];
        const aprMtd  = surg?.scheduled_rev || 0;
        const aprEom  = surgEomRev[name] || surgEomRev[code] || 0;
        const priorRev = act?.prior_rev || 0;
        const ytdEst  = priorRev + aprEom;
        const ytdActProcs = ytdPriorMonthsProcs[name] || ytdPriorMonthsProcs[code] || 0;
        const ytdEomProcs26 = ytdActProcs + (surgEomProcs[name] || surgEomProcs[code] || 0);
        return {
                    client_name: c.client || code,
          go_live_date: fmtDate(c.contract_start_date),
          ees: c.ees,
          fee_structure: c.fee_structure || '—',
          carveout: carveoutLabel(c.carve_out),
          vintage: String(c.cohort),
          ytd_first_calls: funnelData ? parseInt(funnelData.ytd_first_calls) || null : null,
          ytd_new_cases: funnelData ? parseInt(funnelData.ytd_new_cases) || null : null,
          eop_active_cases: funnelData ? parseInt(funnelData.eop_active_cases) || null : null,
          ytd_consults: funnelData ? parseInt(funnelData.ytd_consults) || null : null,
          ytd_procedures: ytdEomProcs26 || null,
          apr_revenue: Math.round(aprMtd / 1000),
          apr_eom_est: Math.round(aprEom / 1000),
          ytd_revenue: Math.round(ytdEst / 1000),
          ytd_vs_budget_pct: (budByName[name] || budByName[code]) ? parseFloat(((ytdEst - (budByName[name] || budByName[code])) / (budByName[name] || budByName[code]) * 100).toFixed(1)) : null,
        };
      }).sort((a: any, b: any) => (b.ytd_revenue || 0) - (a.ytd_revenue || 0));

    // MTD Performance data
    // Fixed-fee EOM hardcoded (from financials, held flat prior month)
    // These match the hardcoded values in the Excel (row 32 col D = 3172352, row 41 col D = 670908)
    // Get prior month fixed+other actuals from other_revenues, fall back to hardcoded
    let fixedFeeEom = 3172352;   // hardcoded EOM forecast
    let otherFeeEom = 670908;    // hardcoded EOM forecast

    // Override with actual prior month data if available in other_revenues
    const priorMonthFixed: Record<string, number> = {};
    const priorMonthOther: Record<string, number> = {};
    let pyVarFeeRev = 0;      // prior year variable fee revenue (same month)
    let pyFixedFeeRev = 0;    // prior year fixed fee revenue
    let pyOtherFeeRev = 0;    // prior year other fee revenue
    let budgetVarFeeRev = 0;  // budget variable fee monthly
    let budgetFixedFeeRev = 3172352; // budget fixed fee monthly
    let budgetOtherFeeRev = 670908;  // budget other fee monthly
    let okrVarFeeRev = 0;
    let okrFixedFeeRev = 3172352;
    let okrOtherFeeRev = 670908;

    for (const r of otherRevenues) {
      const rev = parseRevenue(r.amount);
      const parsed = parseYearMonth(r.revenue_month);
      if (!parsed) continue;
      const { ry, rm } = parsed;
      const dt = String(r.data_type || '');
      const cat = String(r.category || '');

      // Prior year same month actuals
      if (dt === 'actual' && ry === year - 1 && rm === month) {
        if (cat === 'variable_fee') pyVarFeeRev += rev;
        else if (cat === 'fixed_fee') pyFixedFeeRev += rev;
        else pyOtherFeeRev += rev;
      }
      // Budget monthly
      if (dt === 'budget' && ry === year && rm === month) {
        if (cat === 'variable_fee') budgetVarFeeRev += rev;
        else if (cat === 'fixed_fee') budgetFixedFeeRev = rev;
        else budgetOtherFeeRev += rev;
      }
      // OKR monthly
      if (dt === 'okr' && ry === year && rm === month) {
        if (cat === 'variable_fee') okrVarFeeRev += rev;
        else if (cat === 'fixed_fee') okrFixedFeeRev = rev;
        else okrOtherFeeRev += rev;
      }
    }

    // MTD = EOM * (biz days so far / total biz days) — same scaleDown as scaleUpFactor inverse
    const scaleDownFactor = curveAtToday; // = biz days progress (0-1)
    const fixedFeeMtd = fixedFeeEom * scaleDownFactor;
    const otherFeeMtd = otherFeeEom * scaleDownFactor;
    const pyFixedMtd = pyFixedFeeRev > 0 ? pyFixedFeeRev : fixedFeeEom * scaleDownFactor;
    const pyOtherMtd = pyOtherFeeRev > 0 ? pyOtherFeeRev : otherFeeEom * scaleDownFactor;

    // Total MTD and EOM revenue ($M)
    const actVarMtd = totalScheduledRev;
    const actVarEom = totalEomRev;

    const toM = (v: number) => parseFloat((v / 1_000_000).toFixed(2));

    const actTotalMtd = toM(actVarMtd + fixedFeeMtd + otherFeeMtd);
    const actTotalEom = toM(actVarEom + fixedFeeEom + otherFeeEom);

    const pyTotalMtd = toM(pyMonthRev + pyFixedMtd + pyOtherMtd);
    const pyTotalEom = toM(pyMonthRev + pyFixedMtd + pyOtherMtd); // PY full month

    // Use other_revenues table values directly - don't mix with curBudRev
    // Budget/OKR use Data Sources numbers (PEPM is in otherFeeRev, not fixed fee)
    const budVarRev = budgetVarFeeRev || curBudRev;
    const budgetEomTotal = budVarRev + budgetOtherFeeRev; // no separate fixed fee - PEPM included in other
    const budgetTotalEom = toM(budgetEomTotal);
    const budgetTotalMtd = toM(budgetEomTotal * scaleDownFactor);

    const okrVarRev = okrVarFeeRev || (budVarRev * 1.1);
    const okrEomTotal = okrVarRev + okrOtherFeeRev; // PEPM same as budget, included in other
    const okrTotalEom = toM(okrEomTotal);
    const okrTotalMtd = toM(okrEomTotal * scaleDownFactor);

    // Procedure counts
    const pyVarProcs = Object.values(priorProcByClient).reduce((a, c) => a + (c[month] || 0), 0);
    const pyFixedProcs = 465; // hardcoded from Data Sources row 5 (avg monthly 2025)
    const pyTotalProcs = pyVarProcs + pyFixedProcs;

    // Proc counts from other_revenues table (proc_count category)
    let budgetVarProcs = 0;
    let budgetFixedProcs = 521;
    let okrVarProcs = 0;
    let okrFixedProcs = 521;
    for (const r of otherRevenues) {
      const parsed = parseYearMonth(r.revenue_month);
      if (!parsed) continue;
      const { ry, rm } = parsed;
      const dt = String(r.data_type || '');
      const rt = String(r.revenue_type || '');
      const cat = String(r.category || '');
      if (cat === 'proc_count' && ry === year && rm === month) {
        if (dt === 'budget' && rt === 'Variable Procs') budgetVarProcs = parseRevenue(r.amount);
        if (dt === 'budget' && rt === 'Fixed Procs') budgetFixedProcs = parseRevenue(r.amount);
        if (dt === 'okr' && rt === 'Variable Procs') okrVarProcs = parseRevenue(r.amount);
        if (dt === 'okr' && rt === 'Fixed Procs') okrFixedProcs = parseRevenue(r.amount);
      }
    }
    const budVarProcs = budgetVarProcs || 2471;
    const budFixedProcs = budgetFixedProcs || 521;
    const budgetTotalProcs = Math.round(budVarProcs + budFixedProcs);
    const budgetTotalProcsEom = budgetTotalProcs;
    // OKR fixed procs = budget fixed procs × (okr var procs / budget var procs)
    const okrVar = okrVarProcs || 2959;
    const okrFixedScaled = budVarProcs > 0 ? Math.round(budFixedProcs * (okrVar / budVarProcs)) : budFixedProcs;
    const okrTotalProcs = Math.round(okrVar + okrFixedScaled);

    const actTotalProcs = totalScheduledProcs;
    const actTotalProcsEom = totalEomProcs;

    const varRevBudget = Math.round(totalScheduledRev - curBudRev);
    const varRevPY = Math.round(totalScheduledRev - pyMonthRev);
    const varEomBudget = Math.round(totalEomRev - curBudRev);
    const varEomPY = Math.round(totalEomRev - pyMonthRev);

    const mtdPerformance = {
      date: new Date().toISOString().substring(0, 10),
      month_label: new Date().toLocaleString('en-US', { month: 'short', year: '2-digit' }),
      revenue: {
        actual_mtd:        actTotalMtd,
        actual_eom:        actTotalEom,
        py_mtd:            pyTotalMtd,
        py_eom:            pyTotalEom,
        budget_mtd:        budgetTotalMtd,
        budget_eom:        budgetTotalEom,
        okr_mtd:           okrTotalMtd,
        okr_eom:           okrTotalEom,
        var_vs_py_mtd:     parseFloat((actTotalMtd - pyTotalMtd).toFixed(2)),
        var_vs_py_eom:     parseFloat((actTotalEom - pyTotalEom).toFixed(2)),
        var_vs_budget_mtd: parseFloat((actTotalMtd - budgetTotalMtd).toFixed(2)),
        var_vs_budget_eom: parseFloat((actTotalEom - budgetTotalEom).toFixed(2)),
        var_vs_okr_mtd:    parseFloat((actTotalMtd - okrTotalMtd).toFixed(2)),
        var_vs_okr_eom:    parseFloat((actTotalEom - okrTotalEom).toFixed(2)),
        pct_of_py_mtd:     pyTotalMtd ? parseFloat((actTotalMtd / pyTotalMtd).toFixed(3)) : null,
        pct_of_py_eom:     pyTotalEom ? parseFloat((actTotalEom / pyTotalEom).toFixed(3)) : null,
        pct_of_budget_mtd: budgetTotalMtd ? parseFloat((actTotalMtd / budgetTotalMtd).toFixed(3)) : null,
        pct_of_budget_eom: budgetTotalEom ? parseFloat((actTotalEom / budgetTotalEom).toFixed(3)) : null,
        pct_of_okr_mtd:    okrTotalMtd ? parseFloat((actTotalMtd / okrTotalMtd).toFixed(3)) : null,
        pct_of_okr_eom:    okrTotalEom ? parseFloat((actTotalEom / okrTotalEom).toFixed(3)) : null,
      },
      procedures: {
        actual_mtd:        actTotalProcs,
        actual_eom:        actTotalProcsEom,
        py_mtd:            pyTotalProcs || null,
        py_eom:            pyTotalProcs || null,
        budget_mtd:        budgetTotalProcs || null,
        budget_eom:        budgetTotalProcsEom || null,
        okr_mtd:           okrTotalProcs || null,
        okr_eom:           okrTotalProcs ? Math.round(okrTotalProcs / scaleDownFactor) : null,
        var_vs_py_mtd:     pyTotalProcs ? actTotalProcs - pyTotalProcs : null,
        var_vs_py_eom:     pyTotalProcs ? actTotalProcsEom - pyTotalProcs : null,
        var_vs_budget_mtd: budgetTotalProcs ? actTotalProcs - budgetTotalProcs : null,
        var_vs_budget_eom: budgetTotalProcs ? actTotalProcsEom - budgetTotalProcsEom : null,
        var_vs_okr_mtd:    okrTotalProcs ? actTotalProcs - okrTotalProcs : null,
        var_vs_okr_eom:    okrTotalProcs ? actTotalProcsEom - Math.round(okrTotalProcs / scaleDownFactor) : null,
        pct_of_py_mtd:     pyTotalProcs ? parseFloat((actTotalProcs / pyTotalProcs).toFixed(3)) : null,
        pct_of_py_eom:     pyTotalProcs ? parseFloat((actTotalProcsEom / pyTotalProcs).toFixed(3)) : null,
        pct_of_budget_mtd: budgetTotalProcs ? parseFloat((actTotalProcs / budgetTotalProcs).toFixed(3)) : null,
        pct_of_budget_eom: budgetTotalProcs ? parseFloat((actTotalProcsEom / budgetTotalProcsEom).toFixed(3)) : null,
        pct_of_okr_mtd:    okrTotalProcs ? parseFloat((actTotalProcs / okrTotalProcs).toFixed(3)) : null,
        pct_of_okr_eom:    okrTotalProcs ? parseFloat((actTotalProcsEom / Math.round(okrTotalProcs / scaleDownFactor)).toFixed(3)) : null,
      },
      // Legacy fields
      apr_mtd: Math.round(totalScheduledRev),
      apr_eom_fcst: Math.round(totalEomRev),
      vs_py_mtd: pyMonthRev || null,
      vs_py_eom: Math.round(totalEomRev) || null,
      var_vs_py_mtd: pyMonthRev ? varRevPY : null,
      var_vs_py_eom: pyMonthRev ? varEomPY : null,
      pct_vs_py_mtd: pyMonthRev ? parseFloat((totalScheduledRev / pyMonthRev).toFixed(3)) : null,
      pct_vs_py_eom: pyMonthRev ? parseFloat((totalEomRev / pyMonthRev).toFixed(3)) : null,
      vs_budget_mtd: curBudRev || null,
      vs_budget_eom: curBudRev || null,
      var_vs_budget_mtd: curBudRev ? varRevBudget : null,
      var_vs_budget_eom: curBudRev ? varEomBudget : null,
      pct_vs_budget_mtd: curBudRev ? parseFloat((totalScheduledRev / curBudRev).toFixed(3)) : null,
      pct_vs_budget_eom: curBudRev ? parseFloat((totalEomRev / curBudRev).toFixed(3)) : null,
    };

    return NextResponse.json({
      source: 'databricks',
      refreshedAt: new Date().toISOString(),
      meta: { business_day: currentBizDay, total_biz_days: totalBizDays, scale_factor: parseFloat(scaleUpFactor.toFixed(3)), curve_at_today: curveAtToday },
      kpis: {
        apr_mtd_revenue: Math.round(actVarMtd + fixedFeeMtd + otherFeeMtd),
        apr_month_forecast: Math.round(actVarEom + fixedFeeEom + otherFeeEom),
        apr_mtd_procedures: totalScheduledProcs,
        apr_proc_forecast: totalEomProcs,
        ytd_procedures: totalYtdActProcs + totalEomProcs,
        ytd_revenue: Math.round(ytdRevTotal + (fixedFeeEom + otherFeeEom) * (month - 1) + fixedFeeMtd + otherFeeMtd),
        apr_mtd_revenue_vs_py: pyTotalMtd ? parseFloat(((actTotalMtd - pyTotalMtd) / pyTotalMtd * 100).toFixed(1)) : null,
        apr_month_forecast_vs_budget: budgetTotalEom ? parseFloat(((actTotalEom - budgetTotalEom) / budgetTotalEom * 100).toFixed(1)) : null,
        apr_mtd_procedures_vs_py: null,
        apr_proc_forecast_vs_budget: null,
        ytd_procedures_vs_py: totalPriorProcs ? parseFloat(((totalYtdActProcs + totalEomProcs - totalPriorProcs) / totalPriorProcs * 100).toFixed(1)) : null,
        ytd_revenue_vs_py: pyYtdRev ? parseFloat(((ytdRevTotal - pyYtdRev) / pyYtdRev * 100).toFixed(1)) : null,
      },
      top50: allWithTotal,
      top50_only: top50,
      cohort,
      mtd_performance: mtdPerformance,
    });

  } catch (error: any) {
    console.error('Dashboard API error:', error);
    const { FALLBACK_DATA } = await import('@/lib/fallback');
    return NextResponse.json({ ...FALLBACK_DATA, error: error.message });
  }
}
