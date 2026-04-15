// src/app/page.tsx
import DashboardClient from '@/components/DashboardClient'
import type { DashboardData } from '@/lib/types'

// Revalidate every 5 minutes on the server (ISR)
export const revalidate = 300

async function getData(): Promise<DashboardData> {
  try {
    const base =
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

    const res = await fetch(`${base}/api/databricks`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`API ${res.status}`)
    return await res.json()
  } catch {
    // During build or if API is unavailable, import fallback directly
    const { FALLBACK_DATA } = await import('@/lib/fallback')
    return FALLBACK_DATA
  }
}

export default async function Home() {
  const data = await getData()
  return <DashboardClient initialData={data} />
}
