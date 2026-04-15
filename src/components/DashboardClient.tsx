'use client'
// src/components/DashboardClient.tsx

import { useState, useCallback, useEffect } from 'react'
import type { DashboardData, Top50Client, CohortClient } from '@/lib/types'
import styles from './Dashboard.module.css'

// ─── helpers ──────────────────────────────────────────────────────────────────
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

// ─── Badge ────────────────────────────────────────────────────────────────────
function PctBadge({ v }: { v: number | null | undefined }) {
  const p = fmtPct(v)
  if (!p) return <span className={styles.dash}>—</span>
  return <span className={`${styles.badge} ${p.pos ? styles.pos : styles.neg}`}>{p.label}</span>
}

// ─── Sort header ──────────────────────────────────────────────────────────────
function Th({
  label, col, sort, onSort, right,
}: { label: string; col: string; sort: SortState; onSort: (c: string) => void; right?: boolean }) {
  const active = sort.col === col
  return (
    <th
      className={`${styles.th} ${right ? styles.right : ''} ${active ? styles.thActive : ''}`}
      onClick={() => onSort(col)}
    >
      {label}
      <span className={styles.sortIcon}>{active ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</span>
    </th>
  )
}

// ─── Filters row ─────────────────────────────────────────────────────────────
function Filters({
  search, onSearch,
  fee, onFee,
  carve, onCarve,
  vintage, onVintage,
  vintages, count,
}: {
  search: string; onSearch: (v: string) => void
  fee: string; onFee: (v: string) => void
  carve: string; onCarve: (v: string) => void
  vintage: string; onVintage: (v: string) => void
  vintages: string[]; count: number
}) {
  return (
    <div className={styles.controls}>
      <input className={styles.ctrl} type="text" value={search} onChange={e => onSearch(e.target.value)} placeholder="Search client…" />
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

// ─── Top 50 table ─────────────────────────────────────────────────────────────
function Top50Table({ rows }: { rows: Top50Client[] }) {
  const [sort, setSort] = useState<SortState>({ col: 'ytd_revenue_26', dir: -1 })
  const [search, setSearch] = useState('')
  const [fee, setFee] = useState('')
  const [carve, setCarve] = useState('')
  const [vintage, setVintage] = useState('')

  const onSort = (col: string) =>
    setSort(s => ({ col, dir: s.col === col ? (s.dir === 1 ? -1 : 1) : -1 }))

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
      <Filters search={search} onSearch={setSearch} fee={fee} onFee={setFee}
        carve={carve} onCarve={setCarve} vintage={vintage} onVintage={setVintage}
        vintages={vintages} count={filtered.length} />
      <div className={styles.tblWrap}>
        <div className={styles.tblScroll}>
          <table className={styles.table}>
            <thead><tr>
              <Th label="Client" col="client_name" sort={sort} onSort={onSort} />
              <Th label="Vintage" col="vintage" sort={sort} onSort={onSort} />
              <Th label="Fee structure" col="fee_structure" sort={sort} onSort={onSort} />
              <Th label="Carve-out" col="carveout" sort={sort} onSort={onSort} />
              <Th label="EEs" col="ees" sort={sort} onSort={onSort} right />
              <Th label="YTD proc '26" col="ytd_procedures_26" sort={sort} onSort={onSort} right />
              <Th label="YTD proc '25" col="ytd_procedures_25" sort={sort} onSort={onSort} right />
              <Th label="Apr rev '26 ($k)" col="apr_revenue_26" sort={sort} onSort={onSort} right />
              <Th label="YTD rev '26 ($k)" col="ytd_revenue_26" sort={sort} onSort={onSort} right />
              <Th label="YTD rev '25 ($k)" col="ytd_revenue_25" sort={sort} onSort={onSort} right />
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
                  <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.ytd_procedures_25)}</td>
                  <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.apr_revenue_26)}</td>
                  <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.ytd_revenue_26)}</td>
                  <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.ytd_revenue_25)}</td>
                  <td className={`${styles.td} ${styles.right}`}><PctBadge v={r.ytd_vs_py_pct} /></td>
                  <td className={`${styles.td} ${styles.right}`}><PctBadge v={r.ytd_vs_budget_pct} /></td>
                </tr>
              ))}
              {totals.map((r, i) => (
                <tr key={`tot-${i}`} className={`${styles.row} ${styles.totalRow}`}>
                  <td className={`${styles.td} ${styles.clientName}`}>{r.client_name}</td>
                  <td className={styles.td}>—</td>
                  <td className={styles.td}>—</td>
                  <td className={styles.td}>—</td>
                  <td className={`${styles.td} ${styles.right}`}>—</td>
                  <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.ytd_procedures_26)}</td>
                  <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.ytd_procedures_25)}</td>
                  <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.apr_revenue_26)}</td>
                  <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.ytd_revenue_26)}</td>
                  <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.ytd_revenue_25)}</td>
                  <td className={`${styles.td} ${styles.right}`}><PctBadge v={r.ytd_vs_py_pct} /></td>
                  <td className={`${styles.td} ${styles.right}`}><PctBadge v={r.ytd_vs_budget_pct} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ─── Cohort table ─────────────────────────────────────────────────────────────
function CohortTable({ rows }: { rows: CohortClient[] }) {
  const [sort, setSort] = useState<SortState>({ col: 'ytd_revenue', dir: -1 })
  const [search, setSearch] = useState('')
  const [fee, setFee] = useState('')
  const [carve, setCarve] = useState('')
  const [vintage, setVintage] = useState('')

  const onSort = (col: string) =>
    setSort(s => ({ col, dir: s.col === col ? (s.dir === 1 ? -1 : 1) : -1 }))

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
      <Filters search={search} onSearch={setSearch} fee={fee} onFee={setFee}
        carve={carve} onCarve={setCarve} vintage={vintage} onVintage={setVintage}
        vintages={vintages} count={filtered.length} />
      <div className={styles.tblWrap}>
        <div className={styles.tblScroll}>
          <table className={styles.table}>
            <thead><tr>
              <Th label="Client" col="client_name" sort={sort} onSort={onSort} />
              <Th label="Go-live" col="go_live_date" sort={sort} onSort={onSort} />
              <Th label="EEs" col="ees" sort={sort} onSort={onSort} right />
              <Th label="Fee structure" col="fee_structure" sort={sort} onSort={onSort} />
              <Th label="Carve-out" col="carveout" sort={sort} onSort={onSort} />
              <Th label="Call rate" col="ytd_call_rate" sort={sort} onSort={onSort} right />
              <Th label="EOP cases" col="eop_active_cases" sort={sort} onSort={onSort} right />
              <Th label="YTD proc" col="ytd_procedures" sort={sort} onSort={onSort} right />
              <Th label="Apr rev ($k)" col="apr_revenue" sort={sort} onSort={onSort} right />
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
                  <td className={`${styles.td} ${styles.right}`}>{r.ytd_call_rate != null ? `${r.ytd_call_rate.toFixed(1)}%` : '—'}</td>
                  <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.eop_active_cases)}</td>
                  <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.ytd_procedures)}</td>
                  <td className={`${styles.td} ${styles.right}`}>{r.apr_revenue != null ? `$${r.apr_revenue}` : '—'}</td>
                  <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.ytd_revenue)}</td>
                  <td className={`${styles.td} ${styles.right}`}><PctBadge v={r.ytd_vs_budget_pct} /></td>
                  <td className={`${styles.td} ${styles.right}`}><PctBadge v={r.ytd_vs_model_pct} /></td>
                </tr>
              ))}
              {totals.map((r, i) => (
                <tr key={`tot-${i}`} className={`${styles.row} ${styles.totalRow}`}>
                  <td className={`${styles.td} ${styles.clientName}`}>{r.client_name}</td>
                  <td className={styles.td}>—</td>
                  <td className={`${styles.td} ${styles.right}`}>—</td>
                  <td className={styles.td}>—</td>
                  <td className={`${styles.td} ${styles.right}`}>{r.ytd_call_rate != null ? `${r.ytd_call_rate.toFixed(1)}%` : '—'}</td>
                  <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.eop_active_cases)}</td>
                  <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.ytd_procedures)}</td>
                  <td className={`${styles.td} ${styles.right}`}>{r.apr_revenue != null ? `$${r.apr_revenue}` : '—'}</td>
                  <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.ytd_revenue)}</td>
                  <td className={`${styles.td} ${styles.right}`}><PctBadge v={r.ytd_vs_budget_pct} /></td>
                  <td className={`${styles.td} ${styles.right}`}><PctBadge v={r.ytd_vs_model_pct} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ─── KPI cards ────────────────────────────────────────────────────────────────
function KpiRow({ kpis }: { kpis: DashboardData['kpis'] }) {
  const cards = [
    { label: 'Apr MTD revenue', value: fmtMoney(kpis.apr_mtd_revenue, 'M'), delta: kpis.apr_mtd_revenue_vs_py, sub: 'vs prior year' },
    { label: 'Apr month forecast', value: fmtMoney(kpis.apr_month_forecast, 'M'), delta: kpis.apr_month_forecast_vs_budget, sub: 'vs budget' },
    { label: 'Apr MTD procedures', value: fmtNum(kpis.apr_mtd_procedures), delta: kpis.apr_mtd_procedures_vs_py, sub: 'vs prior year' },
    { label: 'Apr proc. forecast', value: fmtNum(kpis.apr_proc_forecast), delta: kpis.apr_proc_forecast_vs_budget, sub: 'vs budget' },
    { label: "YTD procedures '26", value: fmtNum(kpis.ytd_procedures), delta: kpis.ytd_procedures_vs_py, sub: 'vs prior year' },
    { label: "YTD revenue '26", value: fmtMoney(kpis.ytd_revenue, 'M'), delta: kpis.ytd_revenue_vs_py, sub: 'vs prior year' },
  ]
  return (
    <div className={styles.kpiRow}>
      {cards.map((c, i) => {
        const p = fmtPct(c.delta)
        return (
          <div key={i} className={styles.kpiCard}>
            <div className={styles.kpiLabel}>{c.label}</div>
            <div className={styles.kpiValue}>{c.value}</div>
            {p && (
              <div className={`${styles.kpiDelta} ${p.pos ? styles.pos : styles.neg}`}>
                {p.label} {c.sub}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main dashboard ──────────────────────────────────────────────────────────
type TabId = 'top50' | 'cohort'

export default function DashboardClient({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState<DashboardData>(initialData)
  const [tab, setTab] = useState<TabId>('top50')
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/databricks', { cache: 'no-store' })
      if (res.ok) setData(await res.json())
    } finally {
      setRefreshing(false)
    }
  }, [])

  // Auto-refresh every 15 minutes
  useEffect(() => {
    const id = setInterval(refresh, 15 * 60 * 1000)
    return () => clearInterval(id)
  }, [refresh])

  const refreshedAt = new Date(data.refreshedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div>
          <div className={styles.headerTitle}>Revenue Projections</div>
          <div className={styles.headerSub}>Surgery Care · 2026 YTD</div>
        </div>
        <div className={styles.headerRight}>
          {data.source === 'fallback' && (
            <span className={styles.fallbackBadge}>Sample data — configure Databricks</span>
          )}
          <span className={styles.refreshTime}>Updated {refreshedAt}</span>
          <button
            className={`${styles.refreshBtn} ${refreshing ? styles.spinning : ''}`}
            onClick={refresh}
            title="Refresh data"
          >
            ↻
          </button>
          <div className={`${styles.dbBadge} ${data.source === 'databricks' ? styles.dbOn : ''}`}>
            <span className={styles.dbDot} />
            Databricks
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <KpiRow kpis={data.kpis} />

        <div className={styles.tabsBar}>
          {(['top50', 'cohort'] as TabId[]).map(t => (
            <button
              key={t}
              className={`${styles.tabBtn} ${tab === t ? styles.tabActive : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'top50' ? 'Top 50 clients' : '2026 cohort'}
            </button>
          ))}
        </div>

        {tab === 'top50' && <Top50Table rows={data.top50} />}
        {tab === 'cohort' && <CohortTable rows={data.cohort} />}
      </main>
    </div>
  )
}
