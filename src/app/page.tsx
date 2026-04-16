// src/app/page.tsx
import DashboardClient from '@/components/DashboardClient'
import type { DashboardData } from '@/lib/types'

export const dynamic = 'force-dynamic'

async function getData(): Promise<DashboardData> {
  try {
    const base = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

    const res = await fetch(`${base}/api/databricks`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`API ${res.status}`)
    const data = await res.json()
    if (!data.kpis || !data.top50) throw new Error('Invalid data shape')
    return data
  } catch (e) {
    console.error('getData error:', e)
    return {
      source: 'fallback',
      refreshedAt: new Date().toISOString(),
      kpis: {
        apr_mtd_revenue: 0, apr_month_forecast: 0,
        apr_mtd_procedures: 0, apr_proc_forecast: 0,
        ytd_procedures: 0, ytd_revenue: 0,
        apr_mtd_revenue_vs_py: null, apr_month_forecast_vs_budget: null,
        apr_mtd_procedures_vs_py: null, apr_proc_forecast_vs_budget: null,
        ytd_procedures_vs_py: null, ytd_revenue_vs_py: null,
      },
      top50: [],
      cohort: [],
    }
  }
}

export default async function Home() {
  const data = await getData()
  return <DashboardClient initialData={data} />
}