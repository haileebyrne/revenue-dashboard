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

function ClientModal({ client, onClose }: { client: any; onClose: () => void }) {
  if (!client) return null

  const months = ['Jan','Feb','Mar','Apr']
  const rev26 = [client.rev26_jan, client.rev26_feb, client.rev26_mar, client.rev26_apr_mtd]
  const rev25 = [client.rev25_jan, client.rev25_feb, client.rev25_mar, client.rev25_apr]
  const p26   = [client.procs26_jan, client.procs26_feb, client.procs26_mar, client.procs26_apr_mtd]
  const p25   = [client.procs25_jan, client.procs25_feb, client.procs25_mar, client.procs25_apr]

  const allRevVals = [...rev26, ...rev25].filter(v => v != null) as number[]
  const allProcVals = [...p26, ...p25].filter(v => v != null) as number[]
  const maxRev  = allRevVals.length  ? Math.max(...allRevVals)  * 1.2 : 1
  const maxProc = allProcVals.length ? Math.max(...allProcVals) * 1.2 : 1

  const CW = 320, CH = 80, PAD_L = 8, PAD_R = 8, PAD_T = 10, PAD_B = 20
  const chartW = CW - PAD_L - PAD_R
  const chartH = CH - PAD_T - PAD_B
  const barGrpW = chartW / 4
  const barW = barGrpW * 0.35

  const toY = (v: number, max: number) => PAD_T + chartH - (v / max) * chartH
  const barX26 = (i: number) => PAD_L + i * barGrpW + barGrpW * 0.1
  const barX25 = (i: number) => PAD_L + i * barGrpW + barGrpW * 0.1 + barW + 3

  const MiniChart = ({ vals26, vals25, max, fmt }: { vals26: (number|null)[]; vals25: (number|null)[]; max: number; fmt: (v:number)=>string }) => (
    <svg viewBox={`0 0 ${CW} ${CH}`} width={CW} height={CH} style={{display:'block', overflow:'visible'}}>
      {[0.5, 1].map(t => (
        <line key={t} x1={PAD_L} x2={CW-PAD_R} y1={toY(max*t, max)} y2={toY(max*t, max)}
          stroke="#D4E4DF" strokeWidth={1} />
      ))}
      {vals26.map((v, i) => v == null ? null : (
        <g key={i}>
          <rect x={barX26(i)} y={toY(v, max)} width={barW}
            height={Math.max(2, CH - PAD_B - toY(v, max))} fill="#1A6B55" rx={2} />
        </g>
      ))}
      {vals25.map((v, i) => v == null ? null : (
        <rect key={i} x={barX25(i)} y={toY(v, max)} width={barW}
          height={Math.max(2, CH - PAD_B - toY(v, max))} fill="#9FE1CB" rx={2} />
      ))}
      {months.map((m, i) => (
        <text key={i} x={PAD_L + i * barGrpW + barGrpW/2} y={CH - 4}
          textAnchor="middle" fontSize={9} fontFamily="DM Sans, sans-serif"
          style={{fill:'#3D6358'}}>{m}</text>
      ))}
      {vals26.map((v, i) => v != null && v === Math.max(...(vals26.filter(x=>x!=null) as number[])) ? (
        <text key={i} x={barX26(i) + barW/2} y={toY(v, max) - 3}
          textAnchor="middle" fontSize={8} fontFamily="DM Sans, sans-serif"
          style={{fill:'#0D2B22'}} fontWeight={600}>{fmt(v)}</text>
      ) : null)}
    </svg>
  )

  const Stat = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div style={{background:'#F7F9F8', borderRadius:8, padding:'10px 14px', minWidth:100}}>
      <div style={{fontSize:10, color:'#7A9E94', fontFamily:'DM Sans, sans-serif', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.04em'}}>{label}</div>
      <div style={{fontSize:16, fontWeight:600, fontFamily:'DM Sans, sans-serif', color: color || '#0D2B22'}}>{value}</div>
    </div>
  )

  const budgPct = client.ytd_vs_budget_pct
  const pyPct   = client.ytd_vs_py_pct
  const budgColor = budgPct == null ? '#0D2B22' : budgPct >= 0 ? '#1A6B3C' : '#C0392B'
  const pyColor   = pyPct   == null ? '#0D2B22' : pyPct   >= 0 ? '#1A6B3C' : '#C0392B'

  return (
    <div style={{position:'fixed', inset:0, background:'rgba(11,79,62,0.45)', zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center'}}
      onClick={onClose}>
      <div style={{background:'#fff', borderRadius:14, width:720, maxWidth:'95vw', maxHeight:'90vh',
        overflowY:'auto', boxShadow:'0 8px 40px rgba(11,79,62,0.18)'}}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{background:'#0B4F3E', borderRadius:'14px 14px 0 0', padding:'20px 24px', display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
          <div>
            <div style={{fontSize:18, fontWeight:600, color:'#F5EDD9', fontFamily:'DM Sans, sans-serif'}}>{client.client_name}</div>
            <div style={{display:'flex', gap:12, marginTop:8, flexWrap:'wrap'}}>
              {[
                { label: 'Vintage',      val: client.vintage ?? '—' },
                { label: 'Fee',          val: client.fee_structure ?? '—' },
                { label: 'Carve-out',    val: client.carveout ?? '—' },
                { label: 'EEs',          val: client.ees ? Number(client.ees).toLocaleString() : '—' },
              ].map(p => (
                <div key={p.label} style={{fontSize:11, fontFamily:'DM Sans, sans-serif'}}>
                  <span style={{color:'rgba(245,237,217,0.55)'}}>{p.label}: </span>
                  <span style={{color:'#F5EDD9', fontWeight:600}}>{String(p.val)}</span>
                </div>
              ))}
            </div>
          </div>
          <button onClick={onClose} style={{background:'rgba(245,237,217,0.15)', border:'none',
            color:'#F5EDD9', fontSize:18, cursor:'pointer', borderRadius:8, width:32, height:32,
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>✕</button>
        </div>

        <div style={{padding:'20px 24px', display:'flex', flexDirection:'column', gap:20}}>

          {/* KPI stats */}
          <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
            <Stat label="YTD Revenue '26" value={client.rev26_ytd ? `$${Number(client.rev26_ytd).toLocaleString()}k` : '—'} />
            <Stat label="YTD vs Budget"   value={budgPct != null ? `${budgPct >= 0 ? '+' : ''}${budgPct.toFixed(1)}%` : '—'} color={budgColor} />
            <Stat label="YTD vs PY"       value={pyPct   != null ? `${pyPct   >= 0 ? '+' : ''}${pyPct.toFixed(1)}%`   : '—'} color={pyColor} />
            <Stat label="Avg Rev/Proc"    value={client.avg_rev_per_proc ? `$${Number(client.avg_rev_per_proc).toLocaleString()}` : '—'} />
            <Stat label="YTD Procedures"  value={client.procs26_ytd ? Number(client.procs26_ytd).toLocaleString() : '—'} />
          </div>

          {/* Revenue chart */}
          <div>
            <div style={{fontSize:11, fontWeight:600, color:'#3D6358', fontFamily:'DM Sans, sans-serif',
              textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8}}>Monthly Revenue ($k)</div>
            <MiniChart vals26={rev26} vals25={rev25} max={maxRev} fmt={v => `$${v}k`} />
            <div style={{display:'flex', gap:14, marginTop:4}}>
              <div style={{display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#3D6358', fontFamily:'DM Sans, sans-serif'}}>
                <span style={{width:10, height:10, background:'#1A6B55', borderRadius:2, display:'inline-block'}} />'26
              </div>
              <div style={{display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#3D6358', fontFamily:'DM Sans, sans-serif'}}>
                <span style={{width:10, height:10, background:'#9FE1CB', borderRadius:2, display:'inline-block'}} />'25
              </div>
            </div>
          </div>

          {/* Procedures chart */}
          <div>
            <div style={{fontSize:11, fontWeight:600, color:'#3D6358', fontFamily:'DM Sans, sans-serif',
              textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8}}>Monthly Procedures</div>
            <MiniChart vals26={p26} vals25={p25} max={maxProc} fmt={v => String(Math.round(v))} />
            <div style={{display:'flex', gap:14, marginTop:4}}>
              <div style={{display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#3D6358', fontFamily:'DM Sans, sans-serif'}}>
                <span style={{width:10, height:10, background:'#1A6B55', borderRadius:2, display:'inline-block'}} />'26
              </div>
              <div style={{display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#3D6358', fontFamily:'DM Sans, sans-serif'}}>
                <span style={{width:10, height:10, background:'#9FE1CB', borderRadius:2, display:'inline-block'}} />'25
              </div>
            </div>
          </div>

          {/* Funnel metrics */}
          {(client.ytd_first_calls != null || client.ytd_new_cases != null || client.ytd_consults != null) && (
            <div>
              <div style={{fontSize:11, fontWeight:600, color:'#3D6358', fontFamily:'DM Sans, sans-serif',
                textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8}}>Funnel Metrics YTD</div>
              <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
                <Stat label="First Calls"  value={client.ytd_first_calls != null ? Number(client.ytd_first_calls).toLocaleString() : '—'} />
                <Stat label="New Cases"    value={client.ytd_new_cases   != null ? Number(client.ytd_new_cases).toLocaleString()   : '—'} />
                <Stat label="Consults"     value={client.ytd_consults    != null ? Number(client.ytd_consults).toLocaleString()    : '—'} />
                <Stat label="Procedures"   value={client.ytd_procedures  != null ? Number(client.ytd_procedures).toLocaleString()  : '—'} />
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

function ClientTable({ rows }: { rows: any[] }) {
  const [selectedClient, setSelectedClient] = useState<any>(null)
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
    <tr key={key} className={`${styles.row} ${isTot ? styles.totalRow : ''}`} onClick={() => { if (!isTot) setSelectedClient(r) }} style={{cursor: isTot ? 'default' : 'pointer'}}>
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
      {selectedClient && <ClientModal client={selectedClient} onClose={() => setSelectedClient(null)} />}
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
            <th className={`${styles.th} ${styles.right}`} style={{borderLeft:'2px solid rgba(245,237,217,0.3)', top:33, top:33}}>Jan</th>
            <th className={`${styles.th} ${styles.right}`} style={{top:33}}>Feb</th>
            <th className={`${styles.th} ${styles.right}`} style={{top:33}}>Mar</th>
            <th className={`${styles.th} ${styles.right}`} style={{top:33}}>Apr MTD</th>
            <th className={`${styles.thEst} ${styles.right}`} style={{top:33}}>Apr Est</th>
            <th className={`${styles.th} ${styles.right}`} style={{top:33}}>YTD</th>
            {/* Procs 25 */}
            <th className={`${styles.th} ${styles.right}`} style={{borderLeft:'2px solid rgba(245,237,217,0.3)', top:33}}>Jan</th>
            <th className={`${styles.th} ${styles.right}`} style={{top:33}}>Feb</th>
            <th className={`${styles.th} ${styles.right}`} style={{top:33}}>Mar</th>
            <th className={`${styles.th} ${styles.right}`} style={{top:33}}>Apr</th>
            <th className={`${styles.th} ${styles.right}`} style={{top:33}}>YTD</th>
            {/* Rev 26 */}
            <th className={`${styles.th} ${styles.right}`} style={{borderLeft:'2px solid rgba(245,237,217,0.3)', top:33}}>Jan</th>
            <th className={`${styles.th} ${styles.right}`} style={{top:33}}>Feb</th>
            <th className={`${styles.th} ${styles.right}`} style={{top:33}}>Mar</th>
            <th className={`${styles.th} ${styles.right}`} style={{top:33}}>Apr MTD</th>
            <th className={`${styles.thEst} ${styles.right}`} style={{top:33}}>Apr Est</th>
            <th className={`${styles.th} ${styles.right}`} style={{top:33}}>YTD</th>
            {/* Rev 25 */}
            <th className={`${styles.th} ${styles.right}`} style={{borderLeft:'2px solid rgba(245,237,217,0.3)', top:33}}>Jan</th>
            <th className={`${styles.th} ${styles.right}`} style={{top:33}}>Feb</th>
            <th className={`${styles.th} ${styles.right}`} style={{top:33}}>Mar</th>
            <th className={`${styles.th} ${styles.right}`} style={{top:33}}>Apr</th>
            <th className={`${styles.th} ${styles.right}`} style={{top:33}}>YTD</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => renderRow(r, i))}
        </tbody>
        <tfoot style={{position:'sticky', bottom:0, zIndex:2}}>
          {totals.map((r, i) => renderRow(r, `tot-${i}`, true))}
        </tfoot>
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

function FunnelTab({ data }: { data: any }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string|null>(null)

  useEffect(() => {
    setLoading(true)
    fetch('/api/funnel')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return }
        setRows(d.data || [])
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return (
    <div style={{padding:'32px 24px', fontFamily:'DM Sans, sans-serif'}}>
      <div style={{color:'#3D6358', fontSize:14, marginBottom:8}}>Loading funnel data...</div>
      <div style={{color:'#7A9E94', fontSize:12}}>This may take 30–60 seconds on first load while the data warehouse warms up.</div>
    </div>
  )
  if (error)   return <div style={{padding:'32px 24px', color:'#C0392B', fontFamily:'DM Sans, sans-serif', fontSize:14}}>Error: {error}</div>
  if (!rows.length) return <div style={{padding:'32px 24px', color:'#3D6358'}}>No funnel data available</div>

  const n = (v: any) => parseFloat(v) || 0
  const fmt1 = (v: number) => isNaN(v) || !isFinite(v) ? 'na' : v.toFixed(1)

  // Build lookup: yyyy_mm -> row
  const byMonth: Record<string, any> = {}
  rows.forEach((r: any) => { byMonth[r.yyyy_mm] = r })

  const years = [...new Set(rows.map((r: any) => r.yyyy_mm.slice(0, 4)))].sort() as string[]
  const months = ['01','02','03','04','05','06','07','08','09','10','11','12']
  const monthLabels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  // Per-10k calculations (cumulative within year = total ytd / avg members)
  const per10k = (metric: string, yyyyMm: string) => {
    const r = byMonth[yyyyMm]
    if (!r) return 'na'
    const m18 = n(r.unique_members_18)
    if (!m18) return 'na'
    return fmt1(n(r[metric]) / m18 * 10000)
  }

  // Cumulative per-10k for a year up to a given month
  const cumulPer10k = (metric: string, yr: string, upToMonth: string) => {
    const yrRows = rows.filter((r: any) => r.yyyy_mm >= `${yr}-01` && r.yyyy_mm <= `${yr}-${upToMonth}`)
    const totalMetric = yrRows.reduce((s: number, r: any) => s + n(r[metric]), 0)
    const avgM18 = yrRows.length ? yrRows.reduce((s: number, r: any) => s + n(r.unique_members_18), 0) / yrRows.length : 0
    if (!avgM18) return 'na'
    return fmt1(totalMetric / avgM18 * 10000)
  }

  // Year total per-10k
  const yearPer10k = (metric: string, yr: string) => {
    const yrRows = rows.filter((r: any) => r.yyyy_mm.startsWith(yr))
    const total = yrRows.reduce((s: number, r: any) => s + n(r[metric]), 0)
    const avgM18 = yrRows.length ? yrRows.reduce((s: number, r: any) => s + n(r.unique_members_18), 0) / yrRows.length : 0
    if (!avgM18) return 'na'
    return fmt1(total / avgM18 * 10000)
  }

  const cellVal = (yr: string, mo: string, metric: string) => {
    const key = `${yr}-${mo}`
    const r = byMonth[key]
    if (!r) return 'na'
    const m18 = n(r.unique_members_18)
    if (!m18) return 'na'
    return fmt1(n(r[metric]) / m18 * 10000)
  }

  const colorCell = (val: string, baseline?: string) => {
    if (val === 'na') return {color:'#9CA3AF'}
    if (!baseline || baseline === 'na') return {}
    const v = parseFloat(val), b = parseFloat(baseline)
    if (v > b * 1.05) return {background:'#DCFCE7', color:'#166534'}
    if (v < b * 0.95) return {background:'#FEE2E2', color:'#991B1B'}
    return {}
  }

  const metrics = [
    { label: 'Calls per 10k Members (Cuml.)', key: 'first_call_count' },
    { label: 'Cases per 10k Members (Cuml.)', key: 'new_opened_cases' },
    { label: 'Consults per 10k Members', key: 'reached_consult' },
    { label: 'Procedures per 10k Members', key: 'reached_procedure' },
  ]

  const thStyle: any = {
    padding: '8px 10px',
    color: '#F5EDD9',
    fontWeight: 600,
    fontSize: 11,
    textAlign: 'center' as const,
    whiteSpace: 'nowrap' as const,
    background: '#0B4F3E',
    borderRight: '1px solid rgba(245,237,217,0.15)',
  }
  const metricHeaderStyle: any = {
    ...thStyle,
    textAlign: 'left' as const,
    minWidth: 220,
  }

  return (
    <div style={{paddingBottom: 40}}>
      <div style={{padding:'20px 24px 0', overflowX:'auto'}}>
        <table style={{borderCollapse:'collapse', fontFamily:'DM Sans, sans-serif', fontSize:12, width:'100%'}}>
          <thead>
            <tr>
              <th style={metricHeaderStyle}></th>
              {monthLabels.map((m, i) => (
                <th key={m} style={{...thStyle, minWidth:52}}>{m}</th>
              ))}
              <th style={{...thStyle, background:'#0B4F3E', fontWeight:700}}>Total</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric, mi) => (
              <>
                {/* Metric group header */}
                <tr key={`header-${metric.key}`}>
                  <td colSpan={14} style={{
                    padding: '8px 12px',
                    background: '#0B4F3E',
                    color: '#F5EDD9',
                    fontWeight: 700,
                    fontSize: 12,
                    borderTop: mi > 0 ? '3px solid #fff' : 'none',
                  }}>
                    {metric.label}
                  </td>
                </tr>
                {/* Year rows */}
                {years.map((yr, yi) => {
                  const isYTD = yr === '2026'
                  const label = isYTD ? `${yr} YTD` : yr
                  const baseYr = yi > 0 ? years[yi-1] : null

                  return (
                    <tr key={`${metric.key}-${yr}`} style={{background: yi % 2 === 0 ? '#fff' : '#F7F9F8'}}>
                      <td style={{padding:'6px 12px', color:'#0D2B22', fontWeight:500, borderRight:'2px solid #E8F2EF'}}>
                        {label}
                      </td>
                      {months.map((mo, moi) => {
                        const key = `${yr}-${mo}`
                        const hasData = !!byMonth[key]
                        const val = hasData ? cellVal(yr, mo, metric.key) : 'na'
                        const baseVal = baseYr ? cellVal(baseYr, mo, metric.key) : undefined
                        const style = colorCell(val, baseVal)
                        return (
                          <td key={mo} style={{
                            padding:'6px 10px',
                            textAlign:'center',
                            fontSize:11,
                            color: val === 'na' ? '#9CA3AF' : '#0D2B22',
                            borderRight:'1px solid #F0F0F0',
                            ...style
                          }}>
                            {val}
                          </td>
                        )
                      })}
                      {/* Total column */}
                      <td style={{
                        padding:'6px 10px',
                        textAlign:'center',
                        fontWeight:600,
                        fontSize:11,
                        color:'#0D2B22',
                        background:'#EDF7F4',
                        borderLeft:'2px solid #D4E4DF',
                      }}>
                        {yearPer10k(metric.key, yr)}
                      </td>
                    </tr>
                  )
                })}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}


type TabId = 'all' | 'top50' | 'cohort' | 'mtd' | 'carveout'
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
        <div style={{display:'flex', alignItems:'stretch', flexWrap:'wrap', gap:16, padding:'12px 24px 0'}}>
          <RevenueWaterfall data={data} />
          <Top5Clients data={data} />
          <div style={{flex:1, minWidth:280}}>
            <CumulProcChart data={data} />
          </div>
        </div>
        <div className={styles.tabs}>
          {([
            { id: 'all',      label: 'All Clients' },
            { id: 'top50',    label: 'Top 50' },
            { id: 'cohort',   label: '2026 Cohort' },
            { id: 'carveout', label: 'Carveout Summary' },
            { id: 'mtd',      label: 'MTD Performance' },
          ] as {id: TabId, label: string}[]).map(({ id: t, label }) => (
            <button key={t}
              className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'all'     && <ClientTable rows={allClients} />}
        {tab === 'top50'   && <ClientTable rows={top50Only} />}
        {tab === 'cohort'  && <CohortTable rows={cohort2026} />}
        {tab === 'mtd'     && <MtdPerformance data={mtdData} />}
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

function MtdGauges({ data }: { data: any }) {
  const rev = data.mtd_performance?.revenue || {}
  const pyPct   = rev.pct_of_py_eom   != null ? rev.pct_of_py_eom   * 100 : null
  const budPct  = rev.pct_of_budget_eom != null ? rev.pct_of_budget_eom * 100 : null
  const okrPct  = rev.pct_of_okr_eom  != null ? rev.pct_of_okr_eom  * 100 : null
  const fcst    = data.kpis?.apr_month_forecast

  if (pyPct == null && budPct == null && okrPct == null) return null

  const gauges = [
    { label: 'Prior Year', pct: pyPct,  color: '#1A6B55' },
    { label: 'Budget',     pct: budPct, color: '#2563eb' },
    { label: 'OKR',        pct: okrPct, color: '#7A9E94' },
  ]

  const CX = 80, CY = 90, R = 60, MAX_PCT = 140

  const arcPath = (pctEnd: number) => {
    const a0 = Math.PI
    const a1 = Math.PI + (Math.min(pctEnd, MAX_PCT) / MAX_PCT) * Math.PI
    const x0 = CX + R * Math.cos(a0), y0 = CY + R * Math.sin(a0)
    const x1 = CX + R * Math.cos(a1), y1 = CY + R * Math.sin(a1)
    const large = (pctEnd / MAX_PCT) > 0.5 ? 1 : 0
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
  }

  const Gauge = ({ label, pct, color }: { label: string; pct: number | null; color: string }) => {
    if (pct == null) return null
    const clamped = Math.min(Math.max(pct, 0), MAX_PCT)
    const needleAngle = Math.PI + (clamped / MAX_PCT) * Math.PI
    const nx = CX + 52 * Math.cos(needleAngle)
    const ny = CY + 52 * Math.sin(needleAngle)
    const tick100Angle = Math.PI + (100 / MAX_PCT) * Math.PI
    const t100x0 = CX + (R - 8) * Math.cos(tick100Angle)
    const t100y0 = CY + (R - 8) * Math.sin(tick100Angle)
    const t100x1 = CX + (R + 8) * Math.cos(tick100Angle)
    const t100y1 = CY + (R + 8) * Math.sin(tick100Angle)
    const valColor = pct >= 100 ? '#1A6B3C' : pct >= 90 ? '#0D2B22' : '#C0392B'

    return (
      <div style={{textAlign:'center'}}>
        <svg viewBox="0 0 160 110" width={160} height={110} style={{display:'block'}}>
          <path d={arcPath(MAX_PCT)} fill="none" stroke="#E8F2EF" strokeWidth={14} strokeLinecap="round" />
          <path d={arcPath(100)} fill="none" stroke="#D4E4DF" strokeWidth={14} strokeLinecap="round" />
          <path d={arcPath(clamped)} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" />
          <line x1={t100x0.toFixed(2)} y1={t100y0.toFixed(2)} x2={t100x1.toFixed(2)} y2={t100y1.toFixed(2)}
            stroke="#0D2B22" strokeWidth={1.5} strokeLinecap="round" />
          <line x1={CX} y1={CY} x2={nx.toFixed(2)} y2={ny.toFixed(2)}
            stroke="#0D2B22" strokeWidth={2} strokeLinecap="round" />
          <circle cx={CX} cy={CY} r={4} fill="#0D2B22" />
          <text x={CX} y={CY - 12} textAnchor="middle" fontSize={16} fontWeight={600}
            fontFamily="DM Sans, sans-serif" style={{fill: valColor}}>
            {pct.toFixed(1)}%
          </text>
          <text x={CX} y={CY + 2} textAnchor="middle" fontSize={9}
            fontFamily="DM Sans, sans-serif" style={{fill:'#7A9E94'}}>
            of {label}
          </text>
          <text x={14} y={106} fontSize={8} fontFamily="DM Sans, sans-serif" style={{fill:'#7A9E94'}}>0%</text>
          <text x={146} y={106} textAnchor="end" fontSize={8} fontFamily="DM Sans, sans-serif" style={{fill:'#7A9E94'}}>140%</text>
        </svg>
        <div style={{fontSize:10, fontWeight:600, color:'#3D6358', fontFamily:'DM Sans, sans-serif', marginTop:2}}>{label}</div>
      </div>
    )
  }

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #D4E4DF',
      borderRadius: 10,
      padding: '14px 20px 12px',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      boxSizing: 'border-box' as const,
    }}>
      <div style={{fontSize:11, fontWeight:600, color:'#3D6358', fontFamily:'DM Sans, sans-serif',
        textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:2}}>
        Apr forecast attainment
      </div>
      {fcst != null && (
        <div style={{fontSize:10, color:'#7A9E94', fontFamily:'DM Sans, sans-serif', marginBottom:10}}>
          Forecast ${(fcst / 1_000_000).toFixed(1)}M
        </div>
      )}
      <div style={{display:'flex', gap:12, alignItems:'flex-start', justifyContent:'center', flex:1}}>
        {gauges.map(g => <Gauge key={g.label} {...g} />)}
      </div>
      <div style={{display:'flex', gap:16, paddingTop:8, justifyContent:'center'}}>
        {gauges.map(g => (
          <div key={g.label} style={{display:'flex', alignItems:'center', gap:4,
            fontSize:10, color:'#3D6358', fontFamily:'DM Sans, sans-serif'}}>
            <span style={{width:10, height:10, background:g.color, borderRadius:2,
              display:'inline-block', flexShrink:0}} />
            {g.label}
          </div>
        ))}
      </div>
    </div>
  )
}

function CumulProcChart({ data }: { data: any }) {
  const top50 = (data.top50 || []) as any[]
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const monthKeys25 = ['proc25_jan','proc25_feb','proc25_mar','proc25_apr','proc25_may','proc25_jun','proc25_jul','proc25_aug','proc25_sep','proc25_oct','proc25_nov','proc25_dec']
  const monthKeys26 = ['proc26_jan','proc26_feb','proc26_mar','proc26_apr','proc26_may','proc26_jun','proc26_jul','proc26_aug','proc26_sep','proc26_oct','proc26_nov','proc26_dec']
  const monthKeys24 = ['proc24_jan','proc24_feb','proc24_mar','proc24_apr','proc24_may','proc24_jun','proc24_jul','proc24_aug','proc24_sep','proc24_oct','proc24_nov','proc24_dec']

  // Build cumulative totals per month
  const cumul = (keys: string[]) => {
    let sum = 0
    return keys.map(k => {
      const v = top50.filter((r:any) => !r.is_total).reduce((s:number, r:any) => s + (parseFloat(r[k]) || 0), 0)
      if (v === 0) return null
      sum += v
      return sum
    })
  }

  const data24 = cumul(monthKeys24)
  const data25 = cumul(monthKeys25)
  const data26 = cumul(monthKeys26)

  const allVals = [...data24, ...data25, ...data26].filter(v => v != null) as number[]
  if (!allVals.length) return null

  const W = 420, H = 160, PAD_L = 40, PAD_R = 16, PAD_T = 16, PAD_B = 24
  const maxV = Math.max(...allVals) * 1.1
  const xStep = (W - PAD_L - PAD_R) / 11
  const x = (i: number) => PAD_L + i * xStep
  const y = (v: number) => PAD_T + (1 - v / maxV) * (H - PAD_T - PAD_B)
  const fmtK = (v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${Math.round(v)}`

  const line = (pts: (number|null)[], stroke: string, dash?: string) => {
    const segs: string[] = []
    let path = ''
    pts.forEach((v, i) => {
      if (v == null) return
      const px = x(i), py = y(v)
      path += path === '' ? `M${px},${py}` : ` L${px},${py}`
    })
    return path ? <path d={path} fill="none" stroke={stroke} strokeWidth={2} strokeDasharray={dash} /> : null
  }

  return (
    <div style={{background:'#fff', border:'1px solid #D4E4DF', borderRadius:10, padding:'14px 16px 10px', flex:1}}>
      <div style={{fontSize:11, fontWeight:600, color:'#3D6358', marginBottom:10, fontFamily:'DM Sans, sans-serif', textTransform:'uppercase', letterSpacing:'0.05em'}}>
        Cumulative YTD Procedures
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%', height:H, display:'block'}}>
        {/* Grid lines */}
        {[0.25,0.5,0.75,1].map(t => (
          <line key={t} x1={PAD_L} x2={W-PAD_R} y1={y(maxV*t)} y2={y(maxV*t)}
            stroke="#E8F2EF" strokeWidth={0.5} />
        ))}
        {/* Y axis labels */}
        {[0.5,1].map(t => (
          <text key={t} x={PAD_L-4} y={y(maxV*t)+4} textAnchor="end"
            fontSize={8} fill="#7A9E94" fontFamily="DM Sans, sans-serif">
            {fmtK(maxV*t)}
          </text>
        ))}
        {/* Lines */}
        {line(data24, '#D4E4DF', '4,3')}
        {line(data25, '#7AB5A0')}
        {line(data26, '#0B4F3E')}
        {/* Dots for 2026 */}
        {data26.map((v, i) => v == null ? null : (
          <circle key={i} cx={x(i)} cy={y(v)} r={3} fill="#0B4F3E" />
        ))}
        {/* X axis labels */}
        {months.map((m, i) => (
          <text key={m} x={x(i)} y={H-4} textAnchor="middle"
            fontSize={8} fill="#7A9E94" fontFamily="DM Sans, sans-serif">{m}</text>
        ))}
      </svg>
      {/* Legend */}
      <div style={{display:'flex', gap:16, marginTop:6, fontFamily:'DM Sans, sans-serif', fontSize:10, color:'#3D6358'}}>
        <span><span style={{display:'inline-block', width:16, height:2, background:'#D4E4DF', marginRight:4, verticalAlign:'middle'}}></span>2024</span>
        <span><span style={{display:'inline-block', width:16, height:2, background:'#7AB5A0', marginRight:4, verticalAlign:'middle'}}></span>2025</span>
        <span><span style={{display:'inline-block', width:16, height:2, background:'#0B4F3E', marginRight:4, verticalAlign:'middle'}}></span>2026</span>
      </div>
    </div>
  )
}

function Top5Clients({ data }: { data: any }) {
  const rows = ((data.top50 || []) as any[])
    .filter((r: any) => !r.is_total && r.client_name !== 'Total Surgery Care Revenue' && (r.fee_structure || '').toLowerCase().includes('variable'))
    .sort((a: any, b: any) => (b.rev26_ytd ?? 0) - (a.rev26_ytd ?? 0))
    .slice(0, 5)

  if (!rows.length) return null

  const maxVal = Math.max(...rows.map((r: any) => Math.max(r.rev26_ytd ?? 0, r.rev25_ytd ?? 0))) * 1.15
  const W = 420, ROW_H = 24, PAD_L = 130, PAD_R = 60, PAD_T = 6, BAR_H = 9
  const H = PAD_T + rows.length * ROW_H + 24
  const toW = (v: number) => v == null ? 0 : Math.max(0, (v / maxVal) * (W - PAD_L - PAD_R))
  const rowY = (i: number) => PAD_T + i * ROW_H

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #D4E4DF',
      borderRadius: 10,
      padding: '14px 16px 10px',
      display: 'inline-block',
      verticalAlign: 'top',
    }}>
      <div style={{fontSize:11, fontWeight:600, color:'#3D6358', marginBottom:10, fontFamily:'DM Sans, sans-serif', textTransform:'uppercase', letterSpacing:'0.05em'}}>Top 5 Clients — YTD Revenue</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%', height:H, display:'block', overflow:'visible'}}>
        {rows.map((r: any, i: number) => {
          const w26 = toW(r.rev26_ytd ?? 0)
          const w25 = toW(r.rev25_ytd ?? 0)
          const aboveBudget = (r.ytd_vs_budget_pct ?? 0) >= -5
          const bar26color = aboveBudget ? '#1A6B55' : '#C0392B'
          const y = rowY(i)
          const shortName = r.client_name.length > 16 ? r.client_name.slice(0, 15) + '…' : r.client_name
          return (
            <g key={i}>
              {/* Client name */}
              <text x={PAD_L - 6} y={y + BAR_H + 2} textAnchor="end"
                fontSize={10.5} fill="#0D2B22" fontFamily="DM Sans, sans-serif">
                {shortName}
              </text>
              {/* PY bar (behind) */}
              <rect x={PAD_L} y={y + 1} width={w25} height={BAR_H + 8}
                fill="#E8F2EF" rx={3} />
              {/* 26 bar (front) */}
              <rect x={PAD_L} y={y} width={w26} height={BAR_H}
                fill={bar26color} rx={3} />
              {/* Value label */}
              <text x={PAD_L + w26 + 5} y={y + BAR_H - 1}
                fontSize={10} fill="#0D2B22" fontFamily="DM Sans, sans-serif" fontWeight="600">
                ${((r.rev26_ytd ?? 0) / 1000).toFixed(1)}M
              </text>
              {/* vs budget badge */}
              {r.ytd_vs_budget_pct != null && (
                <text x={W - 2} y={y + BAR_H - 1} textAnchor="end"
                  fontSize={9.5} fontFamily="DM Sans, sans-serif"
                  fill={aboveBudget ? '#1A6B3C' : '#C0392B'}>
                  {r.ytd_vs_budget_pct >= 0 ? '+' : ''}{r.ytd_vs_budget_pct.toFixed(1)}%
                </text>
              )}
            </g>
          )
        })}
        {/* X axis line */}
        <line x1={PAD_L} x2={W - PAD_R} y1={H - 16} y2={H - 16} stroke="#D4E4DF" strokeWidth={1} />
      </svg>
      {/* Legend */}
      <div style={{display:'flex', gap:16, paddingLeft:110, paddingTop:4}}>
        <div style={{display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#3D6358', fontFamily:'DM Sans, sans-serif'}}>
          <span style={{width:10, height:8, background:'#1A6B55', borderRadius:2, display:'inline-block'}} />'26
        </div>
        <div style={{display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#3D6358', fontFamily:'DM Sans, sans-serif'}}>
          <span style={{width:10, height:8, background:'#E8F2EF', border:'1px solid #7A9E94', borderRadius:2, display:'inline-block'}} />'25
        </div>
        <div style={{display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#3D6358', fontFamily:'DM Sans, sans-serif'}}>
          <span style={{width:8, height:8, background:'#C0392B', borderRadius:2, display:'inline-block'}} />Below budget
        </div>
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

  // Per-month PY revenue from totalRow (convert from $k to $M)
  const py25 = (field: string) => totalRow?.[field] ? totalRow[field] / 1000 + fixedOther : null

  const months = [
    { label: 'Jan',      value: totalRow?.rev26_jan ? totalRow.rev26_jan / 1000 + fixedOther : null, budget: budM(1), py: py25('rev25_jan') },
    { label: 'Feb',      value: totalRow?.rev26_feb ? totalRow.rev26_feb / 1000 + fixedOther : null, budget: budM(2), py: py25('rev25_feb') },
    { label: 'Mar',      value: totalRow?.rev26_mar ? totalRow.rev26_mar / 1000 + fixedOther : null, budget: budM(3), py: py25('rev25_mar') },
    { label: 'Apr MTD',  value: mtd.actual_mtd || null, budget: mtd.budget_mtd || null, py: py25('rev25_apr') },
    { label: 'Apr Fcst', value: mtd.actual_eom || null, budget: mtd.budget_eom || null, py: mtd.py_eom || null, forecast: true },
  ]

  const validVals = months.flatMap(m => [m.value, m.py]).filter(v => v != null) as number[]
  if (!validVals.length) return null

  const maxV = Math.max(...validVals) * 1.25
  const W = 620, H = 120, PAD_L = 48, PAD_R = 28, PAD_T = 18, PAD_B = 24
  const barW = 56
  const chartW = W - PAD_L - PAD_R
  const chartH = H - PAD_T - PAD_B
  const spacing = chartW / months.length
  const toY = (v: number) => PAD_T + chartH - (v / maxV) * chartH
  const barX = (i: number) => PAD_L + i * spacing + (spacing - barW) / 2
  const barMid = (i: number) => barX(i) + barW / 2

  const TX  = { fill: '#0D2B22', fontFamily: 'DM Sans, sans-serif' }
  const TX2 = { fill: '#3D6358', fontFamily: 'DM Sans, sans-serif' }

  // Build PY polyline points from per-month values
  const pyPoints = months
    .map((m, i) => m.py != null ? `${barMid(i)},${toY(m.py)}` : null)
    .filter(Boolean).join(' ')

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #D4E4DF',
      borderRadius: 10,
      padding: '16px 16px 10px',
      display: 'inline-block',
      minWidth: 360,
    }}>
      <div style={{fontSize:11, fontWeight:600, color:'#3D6358', fontFamily:'DM Sans, sans-serif', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:10}}>Monthly Revenue '26</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width: 580, height: H, overflow: 'visible', display: 'block'}}>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map(t => (
          <line key={t} x1={PAD_L} x2={W - PAD_R}
            y1={toY(maxV * t)} y2={toY(maxV * t)}
            stroke="#D4E4DF" strokeWidth={1} />
        ))}
        {/* Y-axis labels */}
        {[0, 0.5, 1].map(t => {
          const v = maxV * t
          return (
            <text key={t} x={PAD_L - 8} y={toY(v) + 4}
              textAnchor="end" fontSize={11} {...TX2}>
              ${Math.round(v)}M
            </text>
          )
        })}
        {/* PY line — per month, not flat */}
        {pyPoints && (
          <polyline points={pyPoints}
            fill="none" stroke="#7A9E94" strokeWidth={2}
            strokeDasharray="5,3" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {/* PY dots */}
        {months.map((m, i) => m.py != null ? (
          <circle key={i} cx={barMid(i)} cy={toY(m.py)} r={3}
            fill="#ffffff" stroke="#7A9E94" strokeWidth={1.5} />
        ) : null)}
        {/* Bars */}
        {months.map((m, i) => {
          if (m.value == null) return null
          const bx = barX(i)
          const by = toY(m.value)
          const bh = Math.max(4, H - PAD_B - by)
          const isFcst = (m as any).forecast
          const mBud = m.budget
          const fill = isFcst
            ? 'rgba(26,107,85,0.2)'
            : (!mBud || m.value >= mBud) ? '#1A6B55'
            : m.value >= mBud * 0.95 ? '#2a9d6e'
            : '#C0392B'
          return (
            <g key={i}>
              <rect x={bx} y={by} width={barW} height={bh} fill={fill} rx={4} />
              {mBud != null && (
                <line x1={bx - 6} x2={bx + barW + 6}
                  y1={toY(mBud)} y2={toY(mBud)}
                  stroke="#2563eb" strokeWidth={2} strokeLinecap="round" />
              )}
              <text x={barMid(i)} y={by - 6}
                textAnchor="middle" fontSize={11} fontWeight="600" {...TX}>
                ${m.value.toFixed(1)}M
              </text>
              <text x={barMid(i)} y={H - PAD_B + 15}
                textAnchor="middle" fontSize={10} {...TX2}>
                {m.label}
              </text>
            </g>
          )
        })}
      </svg>
      {/* Legend */}
      <div style={{display:'flex', gap:20, paddingLeft:52, paddingTop:6}}>
        {([
          { bg:'#1A6B55',    line:false, dash:false, label:'Actual' },
          { bg:'rgba(26,107,85,0.2)', line:false, dash:false, label:'Forecast' },
          { bg:'#2563eb',    line:true,  dash:false, label:'Budget' },
          { bg:'#7A9E94',    line:true,  dash:true,  label:'Prior Year' },
        ] as any[]).map(({ bg, line, dash, label }: any) => (
          <div key={label} style={{display:'flex', alignItems:'center', gap:5,
            fontSize:11, color:'#3D6358', fontFamily:'DM Sans, sans-serif'}}>
            {!line
              ? <span style={{width:13, height:11, background:bg, borderRadius:2, display:'inline-block', flexShrink:0}} />
              : <span style={{width:18, height:0, display:'inline-block', flexShrink:0,
                  borderTop: dash ? `2px dashed ${bg}` : `2px solid ${bg}`}} />
            }
            {label}
          </div>
        ))}
      </div>
    </div>
  )
}
