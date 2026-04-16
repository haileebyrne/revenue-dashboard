'use client'
import { useState, useCallback, useEffect } from 'react'
import type { DashboardData, Top50Client, CohortClient } from '@/lib/types'
import styles from './Dashboard.module.css'

function fmtMoney(v: number | null | undefined, unit = 'k') {
  if (v == null) return '—'
  if (unit === 'M') return `$${(v / 1_000_000).toFixed(1)}M`
  return `$${Number(v).toLocaleString()}`
}
function fmtNum(v: number | null | undefined) {
  if (v == null) return '—'
  return Number(v).toLocaleString()
}
function fmtPct(v: number | null | undefined) {
  if (v == null) return null
  return { value: v, label: `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, pos: v >= 0 }
}
function uniqueVintages(rows: (Top50Client | CohortClient)[]) {
  return [...new Set(rows.filter(r => r.vintage).map(r => String(r.vintage)))].sort()
}
type SortDir = 1 | -1
interface SortState { col: string; dir: SortDir }
function sortRows<T extends Record<string, unknown>>(rows: T[], s: SortState): T[] {
  return [...rows].sort((a, b) => {
    const av = (a[s.col] ?? -Infinity) as number | string
    const bv = (b[s.col] ?? -Infinity) as number | string
    if (typeof av === 'string' && typeof bv === 'string') return s.dir * av.localeCompare(bv)
    return s.dir * ((av as number) - (bv as number))
  })
}
function PctBadge({ v }: { v: number | null | undefined }) {
  const p = fmtPct(v)
  if (!p) return <span className={styles.dash}>—</span>
  return <span className={`${styles.badge} ${p.pos ? styles.pos : styles.neg}`}>{p.label}</span>
}
function Th({ label, col, sort, onSort, right }: { label: string; col: string; sort: SortState; onSort: (c: string) => void; right?: boolean }) {
  const active = sort.col === col
  return (
    <th className={`${styles.th} ${right ? styles.right : ''} ${active ? styles.thActive : ''}`} onClick={() => onSort(col)}>
      {label}<span className={styles.sortIcon}>{active ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</span>
    </th>
  )
}
function Filters({ search, onSearch, fee, onFee, carve, onCarve, vintage, onVintage, vintages, count }: {
  search: string; onSearch: (v: string) => void; fee: string; onFee: (v: string) => void
  carve: string; onCarve: (v: string) => void; vintage: string; onVintage: (v: string) => void
  vintages: string[]; count: number
}) {
  return (
    <div className={styles.controls}>
      <input className={styles.ctrl} type="text" value={search} onChange={e => onSearch(e.target.value)} placeholder="Search client..." />
      <select className={styles.ctrl} value={fee} onChange={e => onFee(e.target.value)}>
        <option value="">All fee structures</option>
        <option>% of Savings</option><option>Variable</option><option>Fixed</option><option>Hybrid</option>
      </select>
      <select className={styles.ctrl} value={carve} onChange={e => onCarve(e.target.value)}>
        <option value="">All carve-outs</option>
        <option>Bariatric Carve-Out</option><option>Multi Carve-Out</option><option>Voluntary</option>
      </select>
      <select className={styles.ctrl} value={vintage} onChange={e => onVintage(e.target.value)}>
        <option value="">All vintages</option>
        {vintages.map(v => <option key={v}>{v}</option>)}
      </select>
      <span className={styles.count}>{count} clients</span>
    </div>
  )
}
function ClientTable({ rows }: { rows: Top50Client[] }) {
  const [sort, setSort] = useState<SortState>({ col: 'ytd_revenue_26', dir: -1 })
  const [search, setSearch] = useState('')
  const [fee, setFee] = useState('')
  const [carve, setCarve] = useState('')
  const [vintage, setVintage] = useState('')
  const onSort = (col: string) => setSort(s => ({ col, dir: s.col === col ? (s.dir === 1 ? -1 : 1) : -1 }))
  const data = rows.filter(r => !r.is_total)
  const totals = rows.filter(r => r.is_total)
  const vintages = uniqueVintages(data)
  const filtered = data.filter(r => {
    if (search && !r.client_name.toLowerCase().includes(search.toLowerCase())) return false
    if (fee && r.fee_structure !== fee) return false
    if (carve && r.carveout !== carve) return false
    if (vintage && String(r.vintage) !== vintage) return false
    return true
  })
  const sorted = sortRows(filtered as unknown as Record<string, unknown>[], sort) as unknown as Top50Client[]
  return (
    <>
      <Filters search={search} onSearch={setSearch} fee={fee} onFee={setFee} carve={carve} onCarve={setCarve} vintage={vintage} onVintage={setVintage} vintages={vintages} count={filtered.length} />
      <div className={styles.tblWrap}><div className={styles.tblScroll}><table className={styles.table}>
        <thead><tr>
          <Th label="Client" col="client_name" sort={sort} onSort={onSort} />
          <Th label="Vintage" col="vintage" sort={sort} onSort={onSort} />
          <Th label="Fee structure" col="fee_structure" sort={sort} onSort={onSort} />
          <Th label="Carve-out" col="carveout" sort={sort} onSort={onSort} />
          <Th label="EEs" col="ees" sort={sort} onSort={onSort} right />
          <Th label="YTD proc 26" col="ytd_procedures_26" sort={sort} onSort={onSort} right />
          <Th label="Apr MTD ($k)" col="apr_revenue_26" sort={sort} onSort={onSort} right />
          <Th label="Apr EOM Est ($k)" col="apr_eom_est" sort={sort} onSort={onSort} right />
          <Th label="YTD rev 26 ($k)" col="ytd_revenue_26" sort={sort} onSort={onSort} right />
          <Th label="YTD rev 25 ($k)" col="ytd_revenue_25" sort={sort} onSort={onSort} right />
          <Th label="YTD vs PY" col="ytd_vs_py_pct" sort={sort} onSort={onSort} right />
          <Th label="YTD vs budget" col="ytd_vs_budget_pct" sort={sort} onSort={onSort} right />
        </tr></thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} className={styles.row}>
              <td className={`${styles.td} ${styles.clientName}`} title={r.client_name}>{r.client_name}</td>
              <td className={styles.td}>{r.vintage ?? '—'}</td>
              <td className={styles.td}>{r.fee_structure}</td>
              <td className={styles.td}>{r.carveout ?? '—'}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.ees)}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.ytd_procedures_26)}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.apr_revenue_26)}</td>
              <td className={`${styles.td} ${styles.right} ${styles.estCell}`}>{fmtMoney(r.apr_eom_est)}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.ytd_revenue_26)}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.ytd_revenue_25)}</td>
              <td className={`${styles.td} ${styles.right}`}><PctBadge v={r.ytd_vs_py_pct} /></td>
              <td className={`${styles.td} ${styles.right}`}><PctBadge v={r.ytd_vs_budget_pct} /></td>
            </tr>
          ))}
          {totals.map((r, i) => (
            <tr key={`tot-${i}`} className={`${styles.row} ${styles.totalRow}`}>
              <td className={`${styles.td} ${styles.clientName}`}>{r.client_name}</td>
              <td className={styles.td}>—</td><td className={styles.td}>—</td><td className={styles.td}>—</td>
              <td className={`${styles.td} ${styles.right}`}>—</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.ytd_procedures_26)}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.apr_revenue_26)}</td>
              <td className={`${styles.td} ${styles.right} ${styles.estCell}`}>{fmtMoney(r.apr_eom_est)}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.ytd_revenue_26)}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.ytd_revenue_25)}</td>
              <td className={`${styles.td} ${styles.right}`}><PctBadge v={r.ytd_vs_py_pct} /></td>
              <td className={`${styles.td} ${styles.right}`}><PctBadge v={r.ytd_vs_budget_pct} /></td>
            </tr>
          ))}
        </tbody>
      </table></div></div>
    </>
  )
}
function CohortTable({ rows }: { rows: CohortClient[] }) {
  const [sort, setSort] = useState<SortState>({ col: 'ytd_revenue', dir: -1 })
  const [search, setSearch] = useState('')
  const [fee, setFee] = useState('')
  const [carve, setCarve] = useState('')
  const [vintage, setVintage] = useState('')
  const onSort = (col: string) => setSort(s => ({ col, dir: s.col === col ? (s.dir === 1 ? -1 : 1) : -1 }))
  const data = rows.filter(r => !r.is_total)
  const totals = rows.filter(r => r.is_total)
  const vintages = uniqueVintages(data)
  const filtered = data.filter(r => {
    if (search && !r.client_name.toLowerCase().includes(search.toLowerCase())) return false
    if (fee && r.fee_structure !== fee) return false
    if (carve && r.carveout !== carve) return false
    if (vintage && String(r.vintage) !== vintage) return false
    return true
  })
  const sorted = sortRows(filtered as unknown as Record<string, unknown>[], sort) as unknown as CohortClient[]
  return (
    <>
      <Filters search={search} onSearch={setSearch} fee={fee} onFee={setFee} carve={carve} onCarve={setCarve} vintage={vintage} onVintage={setVintage} vintages={vintages} count={filtered.length} />
      <div className={styles.tblWrap}><div className={styles.tblScroll}><table className={styles.table}>
        <thead><tr>
          <Th label="Client" col="client_name" sort={sort} onSort={onSort} />
          <Th label="Go-live" col="go_live_date" sort={sort} onSort={onSort} />
          <Th label="EEs" col="ees" sort={sort} onSort={onSort} right />
          <Th label="Fee structure" col="fee_structure" sort={sort} onSort={onSort} />
          <Th label="Carve-out" col="carveout" sort={sort} onSort={onSort} />
          <Th label="YTD proc" col="ytd_procedures" sort={sort} onSort={onSort} right />
          <Th label="Apr MTD ($k)" col="apr_revenue" sort={sort} onSort={onSort} right />
          <Th label="Apr EOM Est ($k)" col="apr_eom_est" sort={sort} onSort={onSort} right />
          <Th label="YTD rev ($k)" col="ytd_revenue" sort={sort} onSort={onSort} right />
          <Th label="YTD vs budget" col="ytd_vs_budget_pct" sort={sort} onSort={onSort} right />
          <Th label="YTD vs model" col="ytd_vs_model_pct" sort={sort} onSort={onSort} right />
        </tr></thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} className={styles.row}>
              <td className={`${styles.td} ${styles.clientName}`} title={r.client_name}>{r.client_name}</td>
              <td className={styles.td}>{r.go_live_date ?? '—'}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.ees)}</td>
              <td className={styles.td}>{r.fee_structure}</td>
              <td className={styles.td}>{r.carveout ?? '—'}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.ytd_procedures)}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.apr_revenue)}</td>
              <td className={`${styles.td} ${styles.right} ${styles.estCell}`}>{fmtMoney(r.apr_eom_est)}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.ytd_revenue)}</td>
              <td className={`${styles.td} ${styles.right}`}><PctBadge v={r.ytd_vs_budget_pct} /></td>
              <td className={`${styles.td} ${styles.right}`}><PctBadge v={r.ytd_vs_model_pct} /></td>
            </tr>
          ))}
          {totals.map((r, i) => (
            <tr key={`tot-${i}`} className={`${styles.row} ${styles.totalRow}`}>
              <td className={`${styles.td} ${styles.clientName}`}>{r.client_name}</td>
              <td className={styles.td}>—</td><td className={`${styles.td} ${styles.right}`}>—</td>
              <td className={styles.td}>—</td><td className={styles.td}>—</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.ytd_procedures)}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.apr_revenue)}</td>
              <td className={`${styles.td} ${styles.right} ${styles.estCell}`}>{fmtMoney(r.apr_eom_est)}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.ytd_revenue)}</td>
              <td className={`${styles.td} ${styles.right}`}><PctBadge v={r.ytd_vs_budget_pct} /></td>
              <td className={`${styles.td} ${styles.right}`}><PctBadge v={r.ytd_vs_model_pct} /></td>
            </tr>
          ))}
        </tbody>
      </table></div></div>
    </>
  )
}
function KpiRow({ kpis }: { kpis: DashboardData['kpis'] }) {
  const cards = [
    { label: 'Apr MTD Revenue', value: fmtMoney(kpis.apr_mtd_revenue, 'M'), delta: kpis.apr_mtd_revenue_vs_py, sub: 'vs prior year' },
    { label: 'Apr EOM Forecast', value: fmtMoney(kpis.apr_month_forecast, 'M'), delta: kpis.apr_month_forecast_vs_budget, sub: 'vs budget' },
    { label: 'Apr MTD Procedures', value: fmtNum(kpis.apr_mtd_procedures), delta: kpis.apr_mtd_procedures_vs_py, sub: 'vs prior year' },
    { label: 'Apr Proc. Forecast', value: fmtNum(kpis.apr_proc_forecast), delta: kpis.apr_proc_forecast_vs_budget, sub: 'vs budget' },
    { label: "YTD Procedures '26", value: fmtNum(kpis.ytd_procedures), delta: kpis.ytd_procedures_vs_py, sub: 'vs prior year' },
    { label: "YTD Revenue '26", value: fmtMoney(kpis.ytd_revenue, 'M'), delta: kpis.ytd_revenue_vs_py, sub: 'vs prior year' },
  ]
  return (
    <div className={styles.kpiRow}>
      {cards.map((c, i) => {
        const p = fmtPct(c.delta)
        return (
          <div key={i} className={styles.kpiCard}>
            <div className={styles.kpiLabel}>{c.label}</div>
            <div className={styles.kpiValue}>{c.value}</div>
            {p && <div className={`${styles.kpiDelta} ${p.pos ? styles.pos : styles.neg}`}>{p.label} {c.sub}</div>}
          </div>
        )
      })}
    </div>
  )
}
type TabId = 'all' | 'top50' | 'cohort'
export default function DashboardClient({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState<DashboardData>(initialData)
  const [tab, setTab] = useState<TabId>('all')
  const [refreshing, setRefreshing] = useState(false)
  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/databricks', { cache: 'no-store' })
      if (res.ok) setData(await res.json())
    } finally { setRefreshing(false) }
  }, [])
  useEffect(() => {
    const id = setInterval(refresh, 15 * 60 * 1000)
    return () => clearInterval(id)
  }, [refresh])

  const allClients: Top50Client[] = (data as any).top50 || []
  const top50Only: Top50Client[] = (data as any).top50_only || allClients.slice(0, 51)
  const cohort2026: CohortClient[] = ((data as any).cohort || []).filter(
    (r: any) => String(r.vintage) === '2026'
  )

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <a className={styles.logo}>
            <svg className={styles.logoIcon} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M55 15 C55 15 80 30 80 58 C80 75 68 88 50 88 C32 88 20 75 20 58 C20 40 35 20 50 12 C50 12 42 35 50 45 C54 50 62 48 65 42 C68 36 65 25 55 15Z" fill="#F5EDD9"/>
              <path d="M45 55 C45 55 30 50 28 62 C26 72 35 80 48 80 C44 74 43 65 45 55Z" fill="#F5EDD9" opacity="0.7"/>
            </svg>
            <span className={styles.logoText}>Lantern</span>
          </a>
          <div className={styles.headerTitle}>
            <h1>Revenue Projections</h1>
            <p>Surgery Care · {new Date().getFullYear()} YTD</p>
          </div>
        </div>
        <div className={styles.headerRight}>
          {(data as any).meta && (
            <span className={styles.sourceTag}>
              Biz day {(data as any).meta.business_day}/{(data as any).meta.total_biz_days} · {((data as any).meta.curve_at_today * 100).toFixed(1)}% scheduled
            </span>
          )}
          <span className={styles.sourceTag}>
            <span className={styles.sourceDot}></span>
            {data.source === 'databricks' ? 'Databricks' : 'Fallback'}
          </span>
          <button className={styles.refreshBtn} onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <span className={styles.sourceTag} style={{color: 'rgba(245,237,217,0.5)'}}>
            Updated {new Date(data.refreshedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
          </span>
        </div>
      </header>
      <main className={styles.main}>
        <KpiRow kpis={data.kpis} />
        <div className={styles.tabs}>
          {([
            ['all', 'All Clients'],
            ['top50', 'Top 50'],
            ['cohort', '2026 Cohort'],
          ] as [TabId, string][]).map(([t, label]) => (
            <button key={t} className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'all'    && <ClientTable rows={allClients} />}
        {tab === 'top50'  && <ClientTable rows={top50Only} />}
        {tab === 'cohort' && <CohortTable rows={cohort2026} />}
      </main>
    </div>
  )
}
