'use client'
import { useState, useCallback, useEffect } from 'react'
import type { DashboardData, Top50Client, CohortClient } from '@/lib/types'
import styles from './Dashboard.module.css'

function fmtM(v: number | null | undefined) {
  if (v == null) return '—'
  return `$${(v / 1_000_000).toFixed(1)}M`
}
function fmtMoney(v: number | null | undefined) {
  if (v == null) return '—'
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
function uniqueVintages(rows: any[]) {
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
function ThEst({ label, col, sort, onSort }: { label: string; col: string; sort: SortState; onSort: (c: string) => void }) {
  const active = sort.col === col
  return (
    <th className={`${styles.thEst} ${styles.right} ${active ? styles.thActive : ''}`} onClick={() => onSort(col)}>
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

function ClientTable({ rows }: { rows: any[] }) {
  const [sort, setSort] = useState<SortState>({ col: 'rev26_ytd', dir: -1 })
  const [search, setSearch] = useState('')
  const [fee, setFee] = useState('')
  const [carve, setCarve] = useState('')
  const [vintage, setVintage] = useState('')
  const onSort = (col: string) => setSort(s => ({ col, dir: s.col === col ? (s.dir === 1 ? -1 : 1) : -1 }))
  const data = rows.filter(r => !r.is_total && r.client_name !== 'Total Surgery Care Revenue')
  const totals = rows.filter(r => r.is_total)
  const vintages = uniqueVintages(data)
  const filtered = data.filter(r => {
    if (search && !r.client_name.toLowerCase().includes(search.toLowerCase())) return false
    if (fee && r.fee_structure !== fee) return false
    if (carve && r.carveout !== carve) return false
    if (vintage && String(r.vintage) !== vintage) return false
    return true
  })
  const sorted = sortRows(filtered as unknown as Record<string, unknown>[], sort) as unknown as any[]

  const renderRow = (r: any, key: string | number, isTot = false) => (
    <tr key={key} className={`${styles.row} ${isTot ? styles.totalRow : ''}`}>
      <td className={`${styles.td} ${styles.clientName}`} title={r.client_name}>{r.client_name}</td>
      <td className={styles.td}>{isTot ? '—' : (r.vintage ?? '—')}</td>
      <td className={styles.td}>{isTot ? '—' : r.fee_structure}</td>
      <td className={styles.td}>{isTot ? '—' : (r.carveout ?? '—')}</td>
      <td className={`${styles.td} ${styles.right}`}>{isTot ? '—' : fmtNum(r.ees)}</td>
      {/* Procedures 26 */}
      <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.procs26_jan)}</td>
      <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.procs26_feb)}</td>
      <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.procs26_mar)}</td>
      <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.procs26_apr_mtd)}</td>
      <td className={`${styles.td} ${styles.right} ${styles.estCell}`}>{fmtNum(r.procs26_apr_est)}</td>
      <td className={`${styles.td} ${styles.right}`} style={{fontWeight:600}}>{fmtNum(r.procs26_ytd)}</td>
      {/* Procedures 25 */}
      <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.procs25_jan)}</td>
      <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.procs25_feb)}</td>
      <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.procs25_mar)}</td>
      <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.procs25_apr)}</td>
      <td className={`${styles.td} ${styles.right}`} style={{fontWeight:600}}>{fmtNum(r.procs25_ytd)}</td>
      {/* Revenue 26 */}
      <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.rev26_jan)}</td>
      <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.rev26_feb)}</td>
      <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.rev26_mar)}</td>
      <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.rev26_apr_mtd)}</td>
      <td className={`${styles.td} ${styles.right} ${styles.estCell}`}>{fmtMoney(r.rev26_apr_est)}</td>
      <td className={`${styles.td} ${styles.right}`} style={{fontWeight:600}}>{fmtMoney(r.rev26_ytd)}</td>
      {/* Revenue 25 */}
      <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.rev25_jan)}</td>
      <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.rev25_feb)}</td>
      <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.rev25_mar)}</td>
      <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.rev25_apr)}</td>
      <td className={`${styles.td} ${styles.right}`} style={{fontWeight:600}}>{fmtMoney(r.rev25_ytd)}</td>
      {/* KPIs */}
      <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.avg_rev_per_proc)}</td>
      <td className={`${styles.td} ${styles.right}`}><PctBadge v={r.ytd_vs_py_pct} /></td>
      <td className={`${styles.td} ${styles.right}`}><PctBadge v={r.ytd_vs_budget_pct} /></td>
    </tr>
  )

  return (
    <>
      <Filters search={search} onSearch={setSearch} fee={fee} onFee={setFee} carve={carve} onCarve={setCarve} vintage={vintage} onVintage={setVintage} vintages={vintages} count={filtered.length} />
      <div className={styles.tblWrap}><div className={styles.tblScroll}><table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th} rowSpan={2}>Client</th>
            <th className={styles.th} rowSpan={2}>Vintage</th>
            <th className={styles.th} rowSpan={2}>Fee Structure</th>
            <th className={styles.th} rowSpan={2}>Carve-out</th>
            <th className={`${styles.th} ${styles.right}`} rowSpan={2}>EEs</th>
            <th className={`${styles.th} ${styles.right}`} colSpan={6} style={{borderLeft:'2px solid rgba(245,237,217,0.3)'}}>YTD Procedures '26</th>
            <th className={`${styles.th} ${styles.right}`} colSpan={5} style={{borderLeft:'2px solid rgba(245,237,217,0.3)'}}>YTD Procedures '25</th>
            <th className={`${styles.th} ${styles.right}`} colSpan={6} style={{borderLeft:'2px solid rgba(245,237,217,0.3)'}}>Monthly Revenue '26 ($k)</th>
            <th className={`${styles.th} ${styles.right}`} colSpan={5} style={{borderLeft:'2px solid rgba(245,237,217,0.3)'}}>Monthly Revenue '25 ($k)</th>
            <th className={`${styles.th} ${styles.right}`} rowSpan={2}>Avg Rev/Proc</th>
            <th className={`${styles.th} ${styles.right}`} rowSpan={2}>YTD vs PY</th>
            <th className={`${styles.th} ${styles.right}`} rowSpan={2}>YTD vs Budg</th>
          </tr>
          <tr>
            {/* Procs 26 */}
            <th className={`${styles.th} ${styles.right}`} style={{borderLeft:'2px solid rgba(245,237,217,0.3)'}}>Jan</th>
            <th className={`${styles.th} ${styles.right}`}>Feb</th>
            <th className={`${styles.th} ${styles.right}`}>Mar</th>
            <th className={`${styles.th} ${styles.right}`}>Apr MTD</th>
            <th className={`${styles.thEst} ${styles.right}`}>Apr Est</th>
            <th className={`${styles.th} ${styles.right}`}>YTD</th>
            {/* Procs 25 */}
            <th className={`${styles.th} ${styles.right}`} style={{borderLeft:'2px solid rgba(245,237,217,0.3)'}}>Jan</th>
            <th className={`${styles.th} ${styles.right}`}>Feb</th>
            <th className={`${styles.th} ${styles.right}`}>Mar</th>
            <th className={`${styles.th} ${styles.right}`}>Apr</th>
            <th className={`${styles.th} ${styles.right}`}>YTD</th>
            {/* Rev 26 */}
            <th className={`${styles.th} ${styles.right}`} style={{borderLeft:'2px solid rgba(245,237,217,0.3)'}}>Jan</th>
            <th className={`${styles.th} ${styles.right}`}>Feb</th>
            <th className={`${styles.th} ${styles.right}`}>Mar</th>
            <th className={`${styles.th} ${styles.right}`}>Apr MTD</th>
            <th className={`${styles.thEst} ${styles.right}`}>Apr Est</th>
            <th className={`${styles.th} ${styles.right}`}>YTD</th>
            {/* Rev 25 */}
            <th className={`${styles.th} ${styles.right}`} style={{borderLeft:'2px solid rgba(245,237,217,0.3)'}}>Jan</th>
            <th className={`${styles.th} ${styles.right}`}>Feb</th>
            <th className={`${styles.th} ${styles.right}`}>Mar</th>
            <th className={`${styles.th} ${styles.right}`}>Apr</th>
            <th className={`${styles.th} ${styles.right}`}>YTD</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => renderRow(r, i))}
          {totals.map((r, i) => renderRow(r, `tot-${i}`, true))}
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
  const data = rows.filter(r => !r.is_total && r.client_name !== 'Total Surgery Care Revenue')
  const totals = rows.filter(r => r.is_total)
  const vintages = uniqueVintages(data)
  const filtered = data.filter(r => {
    if (search && !r.client_name.toLowerCase().includes(search.toLowerCase())) return false
    if (fee && r.fee_structure !== fee) return false
    if (carve && r.carveout !== carve) return false
    if (vintage && String(r.vintage) !== vintage) return false
    return true
  })
  const sorted = sortRows(filtered as unknown as Record<string, unknown>[], sort) as unknown as any[]
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
          <Th label="YTD Calls" col="ytd_first_calls" sort={sort} onSort={onSort} right />
          <Th label="YTD Cases" col="ytd_new_cases" sort={sort} onSort={onSort} right />
          <Th label="EOP Cases" col="eop_active_cases" sort={sort} onSort={onSort} right />
          <Th label="YTD Consults" col="ytd_consults" sort={sort} onSort={onSort} right />
          <Th label="YTD Proc" col="ytd_procedures" sort={sort} onSort={onSort} right />
          <Th label="Apr MTD ($k)" col="apr_revenue" sort={sort} onSort={onSort} right />
          <ThEst label="Apr EOM Est ($k)" col="apr_eom_est" sort={sort} onSort={onSort} />
          <Th label="YTD Rev ($k)" col="ytd_revenue" sort={sort} onSort={onSort} right />
          <Th label="YTD vs budget" col="ytd_vs_budget_pct" sort={sort} onSort={onSort} right />
          
        </tr></thead>
        <tbody>
          {sorted.map((r: any, i: number) => (
            <tr key={i} className={styles.row}>
              <td className={`${styles.td} ${styles.clientName}`} title={r.client_name}>{r.client_name}</td>
              <td className={styles.td}>{r.go_live_date ?? '—'}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.ees)}</td>
              <td className={styles.td}>{r.fee_structure}</td>
              <td className={styles.td}>{r.carveout ?? '—'}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.ytd_first_calls)}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.ytd_new_cases)}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.eop_active_cases)}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.ytd_consults)}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtNum(r.ytd_procedures)}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.apr_revenue)}</td>
              <td className={`${styles.td} ${styles.right} ${styles.estCell}`}>{fmtMoney(r.apr_eom_est)}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtMoney(r.ytd_revenue)}</td>
              <td className={`${styles.td} ${styles.right}`}><PctBadge v={r.ytd_vs_budget_pct} /></td>
              
            </tr>
          ))}
        </tbody>
      </table></div></div>
    </>
  )
}

function MtdPerformance({ data }: { data: any }) {
  if (!data) return <div className={styles.tblWrap} style={{padding:'24px'}}>No MTD data available</div>
  const rev = data.revenue || {}
  const proc = data.procedures || {}
  const d = new Date()
  const dayLabel = `${d.toLocaleString('en-US',{month:'short'})}-${d.getDate()}`
  const mLabel = d.toLocaleString('en-US',{month:'short'})

  const fmtM = (v: number | null | undefined) => v == null ? 'na' : `$${Number(v).toFixed(1)}`
  const fmtN = (v: number | null | undefined) => v == null ? '—' : Number(Math.round(v as number)).toLocaleString()
  const fmtVar = (v: number | null | undefined, isRev: boolean) => {
    if (v == null) return <span className={styles.dash}>—</span>
    const pos = (v as number) >= 0
    const s = isRev ? `${pos?'+':''}${(v as number).toFixed(1)}` : `${pos?'+':''}${Number(Math.round(v as number)).toLocaleString()}`
    return <span className={pos ? styles.pos : styles.neg}>{s}</span>
  }
  const fmtPct = (v: number | null | undefined) => {
    if (v == null) return <span style={{color:'var(--text-3)'}}>na</span>
    const pct = Math.round((v as number) * 100) + '%'
    return <span className={(v as number) >= 1 ? styles.pos : styles.neg}>{pct}</span>
  }

  const Section = ({title, rows, actualMtd, actualEom, isRev}: any) => (
    <div style={{marginBottom:28}}>
      <div className={styles.tblWrap}><div className={styles.tblScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th} style={{textAlign:'left', width:120}}>Total Surgery Care {isRev ? 'Revenue ($mm)' : 'Procedure Count'}</th>
            <th className={`${styles.th} ${styles.right}`} style={{width:90}}>{dayLabel} MTD</th>
            <th className={`${styles.th} ${styles.right}`} style={{width:90}}>{mLabel}. Fcst.</th>
            <th className={`${styles.th} ${styles.right}`} style={{borderLeft:'2px solid rgba(245,237,217,0.3)', width:80}}>MTD Var</th>
            <th className={`${styles.th} ${styles.right}`} style={{width:80}}>Fcst Var</th>
            <th className={`${styles.th} ${styles.right}`} style={{borderLeft:'2px solid rgba(245,237,217,0.3)', width:70}}>MTD %</th>
            <th className={`${styles.th} ${styles.right}`} style={{width:70}}>Fcst %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any, i: number) => (
            <tr key={i} className={styles.row}>
              <td className={styles.td} style={{fontWeight:600}}>{r.label}</td>
              <td className={`${styles.td} ${styles.right}`}>{isRev ? fmtM(r.mtd) : fmtN(r.mtd)}</td>
              <td className={`${styles.td} ${styles.right}`}>{isRev ? fmtM(r.eom) : fmtN(r.eom)}</td>
              <td className={`${styles.td} ${styles.right}`} style={{borderLeft:'2px solid var(--border)'}}>{fmtVar(r.var_mtd, isRev)}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtVar(r.var_eom, isRev)}</td>
              <td className={`${styles.td} ${styles.right}`} style={{borderLeft:'2px solid var(--border)'}}>{fmtPct(r.pct_mtd)}</td>
              <td className={`${styles.td} ${styles.right}`}>{fmtPct(r.pct_eom)}</td>
            </tr>
          ))}
          <tr className={styles.totalRow}>
            <td className={styles.td}>{dayLabel}/26 Actual / Fcst.</td>
            <td className={`${styles.td} ${styles.right}`}>{isRev ? fmtM(actualMtd) : fmtN(actualMtd)}</td>
            <td className={`${styles.td} ${styles.right}`}>{isRev ? fmtM(actualEom) : fmtN(actualEom)}</td>
            <td className={`${styles.td} ${styles.right}`} style={{borderLeft:'2px solid var(--border)'}}>—</td>
            <td className={`${styles.td} ${styles.right}`}>—</td>
            <td className={`${styles.td} ${styles.right}`} style={{borderLeft:'2px solid var(--border)'}}>na</td>
            <td className={`${styles.td} ${styles.right}`}>na</td>
          </tr>
        </tbody>
      </table>
      </div></div>
    </div>
  )

  const revRows = [
    { label: 'PY',          mtd: rev.py_mtd,     eom: rev.py_eom,     var_mtd: rev.var_vs_py_mtd,     var_eom: rev.var_vs_py_eom,     pct_mtd: rev.pct_of_py_mtd,     pct_eom: rev.pct_of_py_eom },
    { label: "'26 Budget", mtd: rev.budget_mtd,  eom: rev.budget_eom,  var_mtd: rev.var_vs_budget_mtd,  var_eom: rev.var_vs_budget_eom,  pct_mtd: rev.pct_of_budget_mtd,  pct_eom: rev.pct_of_budget_eom },
    { label: "'26 OKR",    mtd: rev.okr_mtd,     eom: rev.okr_eom,     var_mtd: rev.var_vs_okr_mtd,     var_eom: rev.var_vs_okr_eom,     pct_mtd: rev.pct_of_okr_mtd,     pct_eom: rev.pct_of_okr_eom },
  ]
  const procRows = [
    { label: 'PY',          mtd: proc.py_mtd,    eom: proc.py_eom,    var_mtd: proc.var_vs_py_mtd,    var_eom: proc.var_vs_py_eom,    pct_mtd: proc.pct_of_py_mtd,    pct_eom: proc.pct_of_py_eom },
    { label: "'26 Budget", mtd: proc.budget_mtd, eom: proc.budget_eom, var_mtd: proc.var_vs_budget_mtd, var_eom: proc.var_vs_budget_eom, pct_mtd: proc.pct_of_budget_mtd, pct_eom: proc.pct_of_budget_eom },
    { label: "'26 OKR",    mtd: proc.okr_mtd,    eom: proc.okr_eom,    var_mtd: proc.var_vs_okr_mtd,   var_eom: proc.var_vs_okr_eom,   pct_mtd: proc.pct_of_okr_mtd,   pct_eom: proc.pct_of_okr_eom },
  ]

  return (
    <div>
      <Section title="" rows={revRows} actualMtd={rev.actual_mtd} actualEom={rev.actual_eom} isRev={true} />
      <Section title="" rows={procRows} actualMtd={proc.actual_mtd} actualEom={proc.actual_eom} isRev={false} />
    </div>
  )
}


function KpiRow({ kpis }: { kpis: DashboardData['kpis'] }) {
  const cards = [
    { label: 'Apr MTD Revenue', value: fmtM(kpis.apr_mtd_revenue), delta: kpis.apr_mtd_revenue_vs_py, sub: 'vs prior year' },
    { label: 'Apr EOM Forecast', value: fmtM(kpis.apr_month_forecast), delta: kpis.apr_month_forecast_vs_budget, sub: 'vs budget' },
    { label: 'Apr MTD Procedures', value: fmtNum(kpis.apr_mtd_procedures), delta: kpis.apr_mtd_procedures_vs_py, sub: 'vs prior year' },
    { label: 'Apr Proc. Forecast', value: fmtNum(kpis.apr_proc_forecast), delta: kpis.apr_proc_forecast_vs_budget, sub: 'vs budget' },
    { label: "YTD Procedures '26", value: fmtNum(kpis.ytd_procedures), delta: kpis.ytd_procedures_vs_py, sub: 'vs prior year' },
    { label: "YTD Revenue '26", value: fmtM(kpis.ytd_revenue), delta: kpis.ytd_revenue_vs_py, sub: 'vs prior year' },
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

type TabId = 'all' | 'top50' | 'cohort' | 'mtd'
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

  const allClients = (data as any).top50 || []
  const top50Only = (data as any).top50_only || allClients.slice(0, 51)
  const cohort2026 = (data as any).cohort || []
  const mtdData = (data as any).mtd_performance

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
          <span className={styles.sourceTag} style={{color:'rgba(245,237,217,0.5)'}}>
            Updated <span suppressHydrationWarning>{new Date(data.refreshedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
          </span>
        </div>
      </header>
      <main className={styles.main}>
        <KpiRow kpis={data.kpis} />
        <div className={styles.tabs}>
          {([
            ['all',    'All Clients'],
            ['top50',  'Top 50'],
            ['cohort', '2026 Cohort'],
            ['mtd',    'MTD Performance'],
          ] as [TabId, string][]).map(([t, label]) => (
            <button key={t} className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'all'    && <ClientTable rows={allClients} />}
        {tab === 'top50'  && <ClientTable rows={top50Only} />}
        {tab === 'cohort' && <CohortTable rows={cohort2026} />}
        {tab === 'mtd'    && <MtdPerformance data={mtdData} />}
      </main>
    </div>
  )
}
