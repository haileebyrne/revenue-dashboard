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
function revColor(pct: number | null | undefined) {
  if (pct == null) return {}
  if (pct >= 5) return { color: '#2a9d6e', fontWeight: 600 }
  if (pct >= -5) return {}
  return { color: '#e05252', fontWeight: 600 }
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
function exportCSV(rows: any[], filename: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => {
    const v = r[k];
    if (v === null || v === undefined) return '';
    if (typeof v === 'string' && v.includes(',')) return `"${v}"`;
    return v;
  }).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
  a.download = filename;
  a.click();
}

function Filters({ search, onSearch, fee, onFee, carve, onCarve, vintage, onVintage, vintages, count, onExport }: {
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
      <span className={styles.count} style={{display:'flex', alignItems:'center', gap:10}}>
        {count} clients
        {onExport && <button onClick={onExport} style={{fontSize:11, padding:'3px 10px', background:'var(--teal)', color:'var(--cream)', border:'none', borderRadius:4, cursor:'pointer', fontWeight:600}}>↓ CSV</button>}
      </span>
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
      <td className={`${styles.td} ${styles.right} ${styles.estCell}`} style={revColor(r.ytd_vs_budget_pct)}>{fmtMoney(r.rev26_apr_est)}</td>
      <td className={`${styles.td} ${styles.right}`} style={{fontWeight:600, ...revColor(r.ytd_vs_budget_pct)}}>{fmtMoney(r.rev26_ytd)}</td>
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
      <Filters search={search} onSearch={setSearch} fee={fee} onFee={setFee} carve={carve} onCarve={setCarve} vintage={vintage} onVintage={setVintage} vintages={vintages} count={filtered.length} onExport={() => exportCSV(sorted, 'clients.csv')} />
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
      <Filters search={search} onSearch={setSearch} fee={fee} onFee={setFee} carve={carve} onCarve={setCarve} vintage={vintage} onVintage={setVintage} vintages={vintages} count={filtered.length} onExport={() => exportCSV(sorted, 'clients.csv')} />
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
      <table className={styles.table} style={{tableLayout:'fixed', width:'100%'}}>
        <thead>
          <tr>
            <th className={styles.th} style={{textAlign:'left', width:140, maxWidth:140}}>Total Surgery Care {isRev ? 'Revenue ($mm)' : 'Procedure Count'}</th>
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
              <td className={styles.td} style={{fontWeight:600, width:100, maxWidth:100}}>{r.label}</td>
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
        <RevenueWaterfall data={data} />
        <div className={styles.tabs}>
          {([
            ['all',    'All Clients'],
            ['top50',  'Top 50'],
            ['cohort', '2026 Cohort'],
        ['carveout', 'Carveout Summary'],
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
        {tab === 'carveout' && <CarveoutTable rows={(data as any).carveoutSummary || []} />}
      </main>
    </div>
  )
}

function CarveoutTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <div style={{padding:24}}>No carveout data</div>
  const fmtN = (v: any) => v == null ? '—' : Number(Math.round(v)).toLocaleString()
  const fmtM = (v: any) => v == null ? '—' : `$${(v/1000).toFixed(1)}M`
  const isTotal = (r: any) => r.carveout === 'Total'

  return (
    <div className={styles.tblWrap}><div className={styles.tblScroll}>
    <table className={styles.table}>
      <thead>
        <tr>
          <th className={styles.th} style={{textAlign:'left'}}>Carve-Out</th>
          <th className={`${styles.th} ${styles.right}`}># Clients</th>
          <th className={`${styles.th} ${styles.right}`}>EEs</th>
          <th className={styles.th} colSpan={6} style={{textAlign:'center', borderLeft:'2px solid rgba(245,237,217,0.2)'}}>YTD Procedures '26</th>
          <th className={styles.th} colSpan={5} style={{textAlign:'center', borderLeft:'2px solid rgba(245,237,217,0.2)'}}>YTD Procedures '25</th>
          <th className={styles.th} colSpan={6} style={{textAlign:'center', borderLeft:'2px solid rgba(245,237,217,0.2)'}}>Monthly Revenue '26 ($K)</th>
          <th className={styles.th} colSpan={5} style={{textAlign:'center', borderLeft:'2px solid rgba(245,237,217,0.2)'}}>Monthly Revenue '25 ($K)</th>
        </tr>
        <tr>
          <th className={styles.th}></th>
          <th className={`${styles.th} ${styles.right}`}></th>
          <th className={`${styles.th} ${styles.right}`}></th>
          {['JAN','FEB','MAR','APR MTD','APR EST','YTD'].map(h => <th key={h} className={`${styles.th} ${styles.right}`} style={h==='JAN'?{borderLeft:'2px solid rgba(245,237,217,0.2)'}:{}}>{h}</th>)}
          {['JAN','FEB','MAR','APR','YTD'].map(h => <th key={h} className={`${styles.th} ${styles.right}`} style={h==='JAN'?{borderLeft:'2px solid rgba(245,237,217,0.2)'}:{}}>{h}</th>)}
          {['JAN','FEB','MAR','APR MTD','APR EST','YTD'].map(h => <th key={h} className={`${styles.th} ${styles.right}`} style={h==='JAN'?{borderLeft:'2px solid rgba(245,237,217,0.2)'}:{}}>{h}</th>)}
          {['JAN','FEB','MAR','APR','YTD'].map(h => <th key={h} className={`${styles.th} ${styles.right}`} style={h==='JAN'?{borderLeft:'2px solid rgba(245,237,217,0.2)'}:{}}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={`${styles.row} ${isTotal(r) ? styles.totalRow : ''}`}>
            <td className={styles.td} style={{fontWeight: isTotal(r) ? 700 : 600}}>{r.carveout}</td>
            <td className={`${styles.td} ${styles.right}`}>{fmtN(r.client_count)}</td>
            <td className={`${styles.td} ${styles.right}`}>{fmtN(r.ees)}</td>
            <td className={`${styles.td} ${styles.right}`} style={{borderLeft:'2px solid var(--border)'}}>{fmtN(r.procs26_jan)}</td>
            <td className={`${styles.td} ${styles.right}`}>{fmtN(r.procs26_feb)}</td>
            <td className={`${styles.td} ${styles.right}`}>{fmtN(r.procs26_mar)}</td>
            <td className={`${styles.td} ${styles.right}`}>{fmtN(r.procs26_apr_mtd)}</td>
            <td className={`${styles.td} ${styles.right} ${styles.estCell}`}>{fmtN(r.procs26_apr_est)}</td>
            <td className={`${styles.td} ${styles.right}`} style={{fontWeight:600}}>{fmtN(r.procs26_ytd)}</td>
            <td className={`${styles.td} ${styles.right}`} style={{borderLeft:'2px solid var(--border)'}}>{fmtN(r.procs25_jan)}</td>
            <td className={`${styles.td} ${styles.right}`}>{fmtN(r.procs25_feb)}</td>
            <td className={`${styles.td} ${styles.right}`}>{fmtN(r.procs25_mar)}</td>
            <td className={`${styles.td} ${styles.right}`}>{fmtN(r.procs25_apr)}</td>
            <td className={`${styles.td} ${styles.right}`} style={{fontWeight:600}}>{fmtN(r.procs25_ytd)}</td>
            <td className={`${styles.td} ${styles.right}`} style={{borderLeft:'2px solid var(--border)'}}>{fmtM(r.rev26_jan)}</td>
            <td className={`${styles.td} ${styles.right}`}>{fmtM(r.rev26_feb)}</td>
            <td className={`${styles.td} ${styles.right}`}>{fmtM(r.rev26_mar)}</td>
            <td className={`${styles.td} ${styles.right}`}>{fmtM(r.rev26_apr_mtd)}</td>
            <td className={`${styles.td} ${styles.right} ${styles.estCell}`}>{fmtM(r.rev26_apr_est)}</td>
            <td className={`${styles.td} ${styles.right}`} style={{fontWeight:600}}>{fmtM(r.rev26_ytd)}</td>
            <td className={`${styles.td} ${styles.right}`} style={{borderLeft:'2px solid var(--border)'}}>{fmtM(r.rev25_jan)}</td>
            <td className={`${styles.td} ${styles.right}`}>{fmtM(r.rev25_feb)}</td>
            <td className={`${styles.td} ${styles.right}`}>{fmtM(r.rev25_mar)}</td>
            <td className={`${styles.td} ${styles.right}`}>{fmtM(r.rev25_apr)}</td>
            <td className={`${styles.td} ${styles.right}`} style={{fontWeight:600}}>{fmtM(r.rev25_ytd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div></div>
  )
}

function TrendChart({ data }: { data: any }) {
  const kpis = data.kpis || {}
  const mtd = data.mtd_performance?.revenue || {}

  // Monthly actual revenue ($M) - from allClients total row
  const totalRow = (data.allClients || []).find((r: any) => r.is_total)
  const jan = totalRow?.rev26_jan ? totalRow.rev26_jan / 1000 : null
  const feb = totalRow?.rev26_feb ? totalRow.rev26_feb / 1000 : null
  const mar = totalRow?.rev26_mar ? totalRow.rev26_mar / 1000 : null
  const aprMtd = mtd.actual_mtd || null
  const aprEom = mtd.actual_eom || null

  // Budget
  const budEom = mtd.budget_eom || null
  // PY
  const pyEom = mtd.py_eom || null

  const points = [
    { label: 'Jan', actual: jan, budget: budEom, py: pyEom },
    { label: 'Feb', actual: feb, budget: budEom, py: pyEom },
    { label: 'Mar', actual: mar, budget: budEom, py: pyEom },
    { label: 'Apr MTD', actual: aprMtd, budget: budEom, py: pyEom },
    { label: 'Apr Fcst', actual: aprEom, budget: budEom, py: pyEom, forecast: true },
  ]

  const allVals = points.flatMap(p => [p.actual, p.budget, p.py]).filter(v => v != null) as number[]
  const maxV = Math.max(...allVals) * 1.1
  const minV = Math.min(...allVals) * 0.9
  const range = maxV - minV

  const W = 600, H = 80, PAD = 30
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2)
  const y = (v: number) => H - PAD/2 - ((v - minV) / range) * (H - PAD)

  const line = (vals: (number|null)[], color: string, dash?: string) => {
    const pts = vals.map((v, i) => v != null ? `${x(i)},${y(v)}` : null).filter(Boolean)
    if (pts.length < 2) return null
    return <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2} strokeDasharray={dash} />
  }

  return (
    <div style={{padding:'12px 24px 0', display:'flex', alignItems:'center', gap:24}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%', maxWidth:600, height:80}}>
        {/* Grid lines */}
        {[0.25,0.5,0.75,1].map(t => (
          <line key={t} x1={PAD} x2={W-PAD} y1={y(minV + range*t)} y2={y(minV + range*t)}
            stroke="var(--border)" strokeWidth={0.5} />
        ))}
        {/* Lines */}
        {line(points.map(p => p.py), 'rgba(245,237,217,0.3)')}
        {line(points.map(p => p.budget), '#5b9bd5', '4,2')}
        {line(points.map(p => p.actual), 'var(--teal-mid)', '')}
        {/* Dots */}
        {points.map((p, i) => p.actual != null ? (
          <circle key={i} cx={x(i)} cy={y(p.actual!)} r={3}
            fill={p.forecast ? 'none' : 'var(--teal-mid)'}
            stroke="var(--teal-mid)" strokeWidth={2} />
        ) : null)}
        {/* Labels */}
        {points.map((p, i) => (
          <text key={i} x={x(i)} y={H-2} textAnchor="middle" fontSize={9} fill="var(--text-3)">{p.label}</text>
        ))}
        {/* Value labels */}
        {points.map((p, i) => p.actual != null ? (
          <text key={i} x={x(i)} y={y(p.actual!) - 5} textAnchor="middle" fontSize={9} fill="var(--text-2)">${p.actual.toFixed(1)}M</text>
        ) : null)}
      </svg>
      <div style={{fontSize:11, color:'var(--text-3)', whiteSpace:'nowrap', lineHeight:2}}>
        <div><span style={{display:'inline-block',width:12,height:8,background:'var(--teal-mid)',marginRight:6,verticalAlign:'middle',borderRadius:2}}></span>Actual / Fcst</div>
        <div><span style={{display:'inline-block',width:12,height:2,background:'#5b9bd5',marginRight:6,verticalAlign:'middle'}}></span>Budget</div>
        <div><span style={{display:'inline-block',width:12,height:2,background:'rgba(245,237,217,0.3)',marginRight:6,verticalAlign:'middle'}}></span>PY</div>
      </div>
    </div>
  )
}

function RevenueWaterfall({ data }: { data: any }) {
  const totalRow = (data.top50 || []).find((r: any) => r.is_total)
  const mtd = data.mtd_performance?.revenue || {}

  const fixedOther = 3.843
  const mb = (data.kpis as any)?.monthly_budget || {}
  const budM = (m: number) => mb[String(m)] ? (mb[String(m)] + 3172352 + 670908) / 1_000_000 : null
  const months = [
    { label: 'Jan',      value: totalRow?.rev26_jan ? totalRow.rev26_jan / 1000 + fixedOther : null, budget: budM(1) },
    { label: 'Feb',      value: totalRow?.rev26_feb ? totalRow.rev26_feb / 1000 + fixedOther : null, budget: budM(2) },
    { label: 'Mar',      value: totalRow?.rev26_mar ? totalRow.rev26_mar / 1000 + fixedOther : null, budget: budM(3) },
    { label: 'Apr MTD',  value: mtd.actual_mtd || null, budget: mtd.budget_mtd || null },
    { label: 'Apr Fcst', value: mtd.actual_eom || null, budget: mtd.budget_eom || null, forecast: true },
  ]

  const py = mtd.py_eom || null
  const validVals = months.map(m => m.value).filter(v => v != null) as number[]
  if (!validVals.length) return null

  const maxV = Math.max(...validVals, py || 0) * 1.22
  const W = 600, H = 150, PAD_L = 50, PAD_R = 32, PAD_T = 18, PAD_B = 28
  const barW = 54
  const chartW = W - PAD_L - PAD_R
  const chartH = H - PAD_T - PAD_B
  const spacing = chartW / months.length
  const toY = (v: number) => PAD_T + chartH - (v / maxV) * chartH
  const barX = (i: number) => PAD_L + i * spacing + (spacing - barW) / 2

  // Visible colors against dark background
  const COLOR_ABOVE    = '#3dbd82'   // bright teal-green — at/above budget
  const COLOR_NEAR     = '#2ea870'   // mid green — within 5%
  const COLOR_BELOW    = '#e05252'   // red — below 95%
  const COLOR_NONE     = '#3dbd82'   // bright green — no budget
  const COLOR_FORECAST = 'rgba(61,189,130,0.38)'  // transparent teal
  const COLOR_BUDGET   = '#64b5f6'   // bright blue
  const COLOR_PY       = 'rgba(245,237,217,0.55)'

  const barColor = (m: typeof months[0]) => {
    if (m.forecast) return COLOR_FORECAST
    if (!m.budget) return COLOR_NONE
    if (m.value! >= m.budget) return COLOR_ABOVE
    if (m.value! >= m.budget * 0.95) return COLOR_NEAR
    return COLOR_BELOW
  }

  return (
    <div style={{padding:'10px 24px 4px', background:'transparent'}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%', maxWidth:700, height:H}}>
        {/* Subtle grid */}
        {[0.25, 0.5, 0.75, 1].map(t => (
          <line key={t} x1={PAD_L} x2={W - PAD_R} y1={toY(maxV * t)} y2={toY(maxV * t)}
            stroke="rgba(245,237,217,0.1)" strokeWidth={1} />
        ))}
        {/* Y-axis labels — bright enough to see */}
        {[0, 0.5, 1].map(t => {
          const v = maxV * t
          return (
            <text key={t} x={PAD_L - 6} y={toY(v) + 4} textAnchor="end"
              fontSize={9} fill="rgba(245,237,217,0.7)">
              ${v.toFixed(0)}M
            </text>
          )
        })}
        {/* PY dashed line */}
        {py && (
          <g>
            <line x1={PAD_L} x2={W - PAD_R - 18} y1={toY(py)} y2={toY(py)}
              stroke={COLOR_PY} strokeWidth={1.5} strokeDasharray="4,3" />
            <text x={W - PAD_R - 16} y={toY(py) - 3} fontSize={8.5} fill="rgba(245,237,217,0.65)">PY</text>
          </g>
        )}
        {/* Bars */}
        {months.map((m, i) => {
          if (m.value == null) return null
          const bx = barX(i)
          const by = toY(m.value)
          const bh = Math.max(2, H - PAD_B - by)
          return (
            <g key={i}>
              <rect x={bx} y={by} width={barW} height={bh} fill={barColor(m)} rx={3} />
              {/* Budget tick — wider than bar, bright */}
              {m.budget != null && (
                <line
                  x1={bx - 5} x2={bx + barW + 5}
                  y1={toY(m.budget)} y2={toY(m.budget)}
                  stroke={COLOR_BUDGET} strokeWidth={2} strokeLinecap="round"
                />
              )}
              {/* Value label — bright white */}
              <text x={bx + barW / 2} y={by - 5} textAnchor="middle"
                fontSize={9.5} fill="#ffffff" fontWeight={700}>
                ${m.value.toFixed(1)}M
              </text>
              {/* Month label */}
              <text x={bx + barW / 2} y={H - PAD_B + 13} textAnchor="middle"
                fontSize={9} fill="rgba(245,237,217,0.75)">
                {m.label}
              </text>
            </g>
          )
        })}
      </svg>
      {/* Legend */}
      <div style={{display:'flex', gap:20, paddingLeft:50, paddingTop:2, flexWrap:'wrap'}}>
        {([
          { color: '#3dbd82',                   type: 'bar',  label: 'Actual' },
          { color: 'rgba(61,189,130,0.38)',      type: 'bar',  label: 'Forecast' },
          { color: '#64b5f6',                   type: 'line', label: 'Budget' },
          { color: 'rgba(245,237,217,0.55)',     type: 'dash', label: 'Prior Year' },
        ] as {color:string,type:string,label:string}[]).map(({ color, type, label }) => (
          <div key={label} style={{fontSize:11, color:'rgba(245,237,217,0.75)', display:'flex', alignItems:'center', gap:5}}>
            {type === 'bar'
              ? <span style={{display:'inline-block', width:13, height:11, background:color, borderRadius:2, flexShrink:0}} />
              : type === 'line'
              ? <span style={{display:'inline-block', width:18, height:2.5, background:color, borderRadius:1, flexShrink:0}} />
              : <span style={{display:'inline-block', width:18, height:0, borderTop:`2px dashed ${color}`, flexShrink:0}} />
            }
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}
