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

    const [actual, budget, inputs, curSurgeries, ytdSurgeries, priorSurgeries, funnel] = await Promise.all([

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
        'SELECT care_hub_name, fee_structure, carve_out, ees, cohort, modeling_go_live, contract_start_date, variable_pct, variable_pct_2 FROM sandboxwarehouse.growth_analytics.client_inputs WHERE care_hub_name IS NOT NULL',
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
    const budByName: Record<string, number> = {};
    let curBudRev = 0; let ytdBudRev = 0;
    for (const r of budget) {
      const rev = parseFloat(r.surgery_care_revenue) || 0;
      const parsed = parseYearMonth(r.revenue_month);
      if (!parsed) continue;
      const { ry, rm } = parsed;
      if (ry === year) {
        budByName[r.client_name] = (budByName[r.client_name] || 0) + rev;
        ytdBudRev += rev;
        if (rm === month) curBudRev += rev;
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
        ees: act?.ees ?? (surg?.ees ? parseInt(surg.ees) : null),
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
      procs26_jan: null, procs26_feb: null, procs26_mar: null,
      procs26_apr_mtd: totalScheduledProcs, procs26_apr_est: totalEomProcs,
      procs26_ytd: totalYtdActProcs + totalEomProcs,
      procs25_jan: null, procs25_feb: null, procs25_mar: null, procs25_apr: null,
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

    const top50 = [...allClients].slice(0, 50).concat([totalRow]);
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
      .filter((c: any) => String(c.cohort) === '2026' && c.care_hub_name && c.care_hub_name !== 'NA')
      .map((c: any) => {
        const name = c.care_hub_name;
        const surg  = surgByName[name];
        const act   = actByName[name] || Object.entries(actByName).find(([k]) =>
          k.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(k.toLowerCase())
        )?.[1];
        const funnelData = funnelByCode[name?.toUpperCase()] || funnelByCode[surg?.client_code?.toUpperCase()];
        const aprMtd  = surg?.scheduled_rev || 0;
        const aprEom  = surgEomRev[name] || 0;
        const priorRev = act?.prior_rev || 0;
        const ytdEst  = priorRev + aprEom;
        const ytdActProcs = ytdPriorMonthsProcs[name] || 0;
        const ytdEomProcs26 = ytdActProcs + (surgEomProcs[name] || 0);
        return {
          // Look up display name — care_hub_name is a code, find matching key in actByName/surgByName
          client_name: (() => {
            if (actByName[name]) return name;
            const actMatch = Object.keys(actByName).find(k => k.toUpperCase() === name.toUpperCase());
            if (actMatch) return actMatch;
            const surgMatch = Object.keys(surgByName).find(k => k.toUpperCase() === name.toUpperCase());
            if (surgMatch) return surgMatch;
            return name;
          })(),
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
          ytd_vs_budget_pct: null,
          ytd_vs_model_pct: null,
        };
      }).sort((a: any, b: any) => (b.ytd_revenue || 0) - (a.ytd_revenue || 0));

    // MTD Performance data
    const varRevBudget = Math.round(totalScheduledRev - curBudRev);
    const varRevPY = Math.round(totalScheduledRev - pyMonthRev);
    const varEomBudget = Math.round(totalEomRev - curBudRev);
    const varEomPY = Math.round(totalEomRev - pyMonthRev);
    const mtdPerformance = {
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
        apr_mtd_revenue: Math.round(totalScheduledRev),
        apr_month_forecast: Math.round(totalEomRev),
        apr_mtd_procedures: totalScheduledProcs,
        apr_proc_forecast: totalEomProcs,
        ytd_procedures: totalYtdActProcs + totalEomProcs,
        ytd_revenue: Math.round(ytdRevTotal),
        apr_mtd_revenue_vs_py: pyMonthRev ? parseFloat(((totalScheduledRev - pyMonthRev) / pyMonthRev * 100).toFixed(1)) : null,
        apr_month_forecast_vs_budget: curBudRev ? parseFloat(((totalEomRev - curBudRev) / curBudRev * 100).toFixed(1)) : null,
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
