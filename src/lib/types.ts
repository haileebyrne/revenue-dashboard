// src/lib/types.ts

export interface Top50Client {
  client_name: string
  vintage: number | null
  fee_structure: string
  carveout: string
  ees: number | null
  ytd_procedures_26: number | null
  ytd_procedures_25: number | null
  apr_revenue_26: number | null
  ytd_revenue_26: number | null
  ytd_revenue_25: number | null
  ytd_vs_py_pct: number | null
  ytd_vs_budget_pct: number | null
  is_total?: boolean
}

export interface CohortClient {
  client_name: string
  go_live_date: string | null
  ees: number | null
  fee_structure: string
  carveout: string
  vintage: number | null
  ytd_call_rate: number | null
  eop_active_cases: number | null
  ytd_procedures: number | null
  apr_revenue: number | null
  ytd_revenue: number | null
  ytd_vs_budget_pct: number | null
  ytd_vs_model_pct: number | null
  is_total?: boolean
}

export interface KpiData {
  apr_mtd_revenue: number
  apr_month_forecast: number
  apr_mtd_procedures: number
  apr_proc_forecast: number
  ytd_procedures: number
  ytd_revenue: number
  apr_mtd_revenue_vs_py: number
  apr_month_forecast_vs_budget: number
  apr_mtd_procedures_vs_py: number
  apr_proc_forecast_vs_budget: number
  ytd_procedures_vs_py: number
  ytd_revenue_vs_py: number
}

export interface DashboardData {
  kpis: KpiData
  top50: Top50Client[]
  cohort: CohortClient[]
  refreshedAt: string
  source: 'databricks' | 'fallback'
}
