// src/lib/fallback.ts
// Shown when Databricks credentials are not yet configured.

import type { DashboardData } from './types'

export const FALLBACK_DATA: DashboardData = {
  source: 'fallback',
  refreshedAt: new Date().toISOString(),
  kpis: {
    apr_mtd_revenue: 4082181,
    apr_month_forecast: 16876419,
    apr_mtd_procedures: 816,
    apr_proc_forecast: 3369,
    ytd_procedures: 11793,
    ytd_revenue: 58754000,
    apr_mtd_revenue_vs_py: 33,
    apr_month_forecast_vs_budget: 5,
    apr_mtd_procedures_vs_py: 45,
    apr_proc_forecast_vs_budget: 13,
    ytd_procedures_vs_py: 53,
    ytd_revenue_vs_py: 50,
  },
  top50: [
    { client_name: 'North Carolina State Health Plan', vintage: 2025, fee_structure: '% of Savings', carveout: 'Bariatric Carve-Out', ees: 344000, ytd_procedures_26: 1115, ytd_procedures_25: 686, apr_revenue_26: 451, ytd_revenue_26: 6877, ytd_revenue_25: null, ytd_vs_py_pct: null, ytd_vs_budget_pct: 101.8 },
    { client_name: 'Northside Hospital', vintage: 2023, fee_structure: '% of Savings', carveout: 'Voluntary', ees: 22472, ytd_procedures_26: 629, ytd_procedures_25: 547, apr_revenue_26: 78, ytd_revenue_26: 1924, ytd_revenue_25: 2353, ytd_vs_py_pct: -18.2, ytd_vs_budget_pct: -20.7 },
    { client_name: '32BJ Health Fund', vintage: 2025, fee_structure: '% of Savings', carveout: 'Multi Carve-Out', ees: 112173, ytd_procedures_26: 403, ytd_procedures_25: 261, apr_revenue_26: 84, ytd_revenue_26: 1823, ytd_revenue_25: 1350, ytd_vs_py_pct: 35.0, ytd_vs_budget_pct: -11.7 },
    { client_name: 'Target', vintage: 2025, fee_structure: '% of Savings', carveout: 'Multi Carve-Out', ees: 100478, ytd_procedures_26: 241, ytd_procedures_25: 11, apr_revenue_26: 185, ytd_revenue_26: 2373, ytd_revenue_25: 55, ytd_vs_py_pct: 4251.4, ytd_vs_budget_pct: 50.0 },
    { client_name: 'State Farm', vintage: 2022, fee_structure: 'Variable', carveout: 'Bariatric Carve-Out', ees: 50000, ytd_procedures_26: 457, ytd_procedures_25: 431, apr_revenue_26: 138, ytd_revenue_26: 1739, ytd_revenue_25: 1975, ytd_vs_py_pct: -11.9, ytd_vs_budget_pct: 19.9 },
    { client_name: 'AT&T', vintage: 2024, fee_structure: '% of Savings', carveout: 'Multi Carve-Out', ees: 10737, ytd_procedures_26: 101, ytd_procedures_25: 24, apr_revenue_26: 64, ytd_revenue_26: 936, ytd_revenue_25: 403, ytd_vs_py_pct: 132.5, ytd_vs_budget_pct: -14.7 },
    { client_name: 'Fresenius', vintage: 2025, fee_structure: '% of Savings', carveout: 'Voluntary', ees: 40282, ytd_procedures_26: 133, ytd_procedures_25: 49, apr_revenue_26: 55, ytd_revenue_26: 1221, ytd_revenue_25: 473, ytd_vs_py_pct: 158.4, ytd_vs_budget_pct: 30.8 },
    { client_name: 'State of Delaware', vintage: 2019, fee_structure: 'Variable', carveout: 'Bariatric Carve-Out', ees: 48235, ytd_procedures_26: 380, ytd_procedures_25: 312, apr_revenue_26: 72, ytd_revenue_26: 1212, ytd_revenue_25: 1218, ytd_vs_py_pct: -0.5, ytd_vs_budget_pct: 35.9 },
    { client_name: 'Waste Connections', vintage: 2023, fee_structure: '% of Savings', carveout: 'Multi Carve-Out', ees: 14533, ytd_procedures_26: 75, ytd_procedures_25: 33, apr_revenue_26: 25, ytd_revenue_26: 943, ytd_revenue_25: 275, ytd_vs_py_pct: 242.9, ytd_vs_budget_pct: 30.3 },
    { client_name: 'Tyson Foods', vintage: 2026, fee_structure: '% of Savings', carveout: 'Voluntary', ees: 113500, ytd_procedures_26: 112, ytd_procedures_25: null, apr_revenue_26: 90, ytd_revenue_26: 697, ytd_revenue_25: null, ytd_vs_py_pct: null, ytd_vs_budget_pct: 331.1 },
    { client_name: 'American Airlines', vintage: 2022, fee_structure: 'Variable', carveout: 'Bariatric Carve-Out', ees: 83529, ytd_procedures_26: 158, ytd_procedures_25: 126, apr_revenue_26: 52, ytd_revenue_26: 883, ytd_revenue_25: 941, ytd_vs_py_pct: -6.1, ytd_vs_budget_pct: 53.3 },
    { client_name: 'Southwest Airlines', vintage: 2026, fee_structure: 'Variable', carveout: 'Voluntary', ees: 72620, ytd_procedures_26: 63, ytd_procedures_25: null, apr_revenue_26: 15, ytd_revenue_26: 230, ytd_revenue_25: null, ytd_vs_py_pct: null, ytd_vs_budget_pct: 171.3 },
    { client_name: 'Commercial Metals Corporation', vintage: 2025, fee_structure: '% of Savings', carveout: 'Voluntary', ees: 7721, ytd_procedures_26: 89, ytd_procedures_25: 29, apr_revenue_26: 76, ytd_revenue_26: 673, ytd_revenue_25: 207, ytd_vs_py_pct: 225.1, ytd_vs_budget_pct: 111.7 },
    { client_name: 'Medtronic', vintage: 2024, fee_structure: '% of Savings', carveout: 'Multi Carve-Out', ees: 18993, ytd_procedures_26: 76, ytd_procedures_25: 31, apr_revenue_26: 29, ytd_revenue_26: 486, ytd_revenue_25: 132, ytd_vs_py_pct: 267.7, ytd_vs_budget_pct: 109.7 },
    { client_name: 'Total Lantern Book', vintage: null, fee_structure: '—', carveout: '—', ees: null, ytd_procedures_26: 11793, ytd_procedures_25: 7718, apr_revenue_26: 3923, ytd_revenue_26: 58754, ytd_revenue_25: 39076, ytd_vs_py_pct: 50.4, ytd_vs_budget_pct: 18.7, is_total: true },
  ],
  cohort: [
    { client_name: 'North Carolina State Health Plan', go_live_date: '10/1/2025', ees: 344000, fee_structure: '% of Savings', carveout: 'Bariatric Carve-Out', vintage: 2025, ytd_call_rate: 5.4, eop_active_cases: 2223, ytd_procedures: 1729, apr_revenue: 2092, ytd_revenue: 6877, ytd_vs_budget_pct: 101.8, ytd_vs_model_pct: 101.8 },
    { client_name: 'Tyson Foods', go_live_date: '1/1/2026', ees: 113500, fee_structure: '% of Savings', carveout: 'Voluntary', vintage: 2026, ytd_call_rate: 3.4, eop_active_cases: 346, ytd_procedures: 97, apr_revenue: 356, ytd_revenue: 697, ytd_vs_budget_pct: 331.1, ytd_vs_model_pct: 32.8 },
    { client_name: 'Southwest Airlines', go_live_date: '1/1/2026', ees: 72620, fee_structure: 'Variable', carveout: 'Voluntary', vintage: 2026, ytd_call_rate: 2.4, eop_active_cases: 149, ytd_procedures: 58, apr_revenue: 64, ytd_revenue: 230, ytd_vs_budget_pct: 171.3, ytd_vs_model_pct: -16.4 },
    { client_name: 'Curative', go_live_date: '1/1/2026', ees: 113000, fee_structure: 'Variable', carveout: 'Voluntary', vintage: 2026, ytd_call_rate: 1.5, eop_active_cases: 147, ytd_procedures: 63, apr_revenue: 122, ytd_revenue: 257, ytd_vs_budget_pct: 257.9, ytd_vs_model_pct: 10.2 },
    { client_name: 'General Dynamics Corporation', go_live_date: '1/1/2026', ees: 55000, fee_structure: '% of Savings', carveout: 'Voluntary', vintage: 2026, ytd_call_rate: 1.5, eop_active_cases: 46, ytd_procedures: 22, apr_revenue: 105, ytd_revenue: 205, ytd_vs_budget_pct: 224.4, ytd_vs_model_pct: -0.1 },
    { client_name: 'Oracle Corporation', go_live_date: '1/1/2026', ees: 52000, fee_structure: '% of Savings', carveout: 'Voluntary', vintage: 2026, ytd_call_rate: 1.2, eop_active_cases: 65, ytd_procedures: 14, apr_revenue: 81, ytd_revenue: 134, ytd_vs_budget_pct: 114.2, ytd_vs_model_pct: -34.0 },
    { client_name: 'GE Aerospace', go_live_date: '1/1/2026', ees: 25827, fee_structure: '% of Savings', carveout: 'Voluntary', vintage: 2026, ytd_call_rate: 2.0, eop_active_cases: 48, ytd_procedures: 21, apr_revenue: 44, ytd_revenue: 169, ytd_vs_budget_pct: 422.1, ytd_vs_model_pct: 60.8 },
    { client_name: 'Hillsborough County Public Schools', go_live_date: '1/1/2026', ees: 18832, fee_structure: '% of Savings', carveout: 'Voluntary', vintage: 2026, ytd_call_rate: 9.6, eop_active_cases: 113, ytd_procedures: 43, apr_revenue: 57, ytd_revenue: 227, ytd_vs_budget_pct: 905.7, ytd_vs_model_pct: 209.8 },
    { client_name: 'HP Inc', go_live_date: '1/1/2026', ees: 11800, fee_structure: '% of Savings', carveout: 'Multi Carve-Out', vintage: 2026, ytd_call_rate: 6.2, eop_active_cases: 96, ytd_procedures: 26, apr_revenue: 55, ytd_revenue: 149, ytd_vs_budget_pct: 153.7, ytd_vs_model_pct: -3.3 },
    { client_name: 'Google', go_live_date: '5/1/2026', ees: 125000, fee_structure: '% of Savings', carveout: 'Voluntary', vintage: 2026, ytd_call_rate: null, eop_active_cases: 0, ytd_procedures: 0, apr_revenue: null, ytd_revenue: 0, ytd_vs_budget_pct: -100.0, ytd_vs_model_pct: -100.0 },
    { client_name: 'Total', go_live_date: null, ees: null, fee_structure: '—', carveout: '—', vintage: null, ytd_call_rate: 3.7, eop_active_cases: 4287, ytd_procedures: 1729, apr_revenue: 3559, ytd_revenue: 10808, ytd_vs_budget_pct: 118.6, ytd_vs_model_pct: 32.4, is_total: true },
  ],
}
