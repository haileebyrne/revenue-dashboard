'use client'
// src/app/admin/clients/AdminClientsClient.tsx
// Accessed only via /admin/clients?secret=YOUR_ADMIN_SECRET
// Not linked from the public dashboard.

import { useState } from 'react'

const VINTAGES = ['2019','2020','2021','2022','2023','2024','2025','2026']
const FEES = ['% of Savings','Variable','Fixed','Hybrid']
const CARVEOUTS = ['Bariatric Carve-Out','Multi Carve-Out','Voluntary']
const PERIODS = ['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06',
                 '2026-07','2026-08','2026-09','2026-10','2026-11','2026-12']

interface ClientForm {
  client_name: string
  ees: string
  vintage: string
  fee_structure: string
  carveout: string
  go_live_date: string
  period: string
  add_to_top50: boolean
  add_to_cohort: boolean
}

const EMPTY: ClientForm = {
  client_name: '', ees: '', vintage: '2026', fee_structure: '',
  carveout: '', go_live_date: '', period: '2026-04',
  add_to_top50: true, add_to_cohort: false,
}

type Status = { type: 'idle' | 'loading' | 'ok' | 'err'; msg: string }

export default function AdminClientsClient({ secret }: { secret: string }) {
  const [form, setForm] = useState<ClientForm>(EMPTY)
  const [status, setStatus] = useState<Status>({ type: 'idle', msg: '' })
  const [showSQL, setShowSQL] = useState(false)

  function set<K extends keyof ClientForm>(field: K, value: ClientForm[K]) {
    setForm(f => ({ ...f, [field]: value }))
    setStatus({ type: 'idle', msg: '' })
  }

  function generatedSQL() {
    const safeName = form.client_name.replace(/'/g, "''")
    const eesVal = form.ees ? parseInt(form.ees) : 'NULL'
    const goLive = form.go_live_date ? `'${form.go_live_date}'` : 'NULL'
    const lines: string[] = []
    if (form.add_to_top50) {
      lines.push(`INSERT INTO revenue.top50_clients
  (client_name, vintage, fee_structure, carveout, ees, period,
   ytd_procedures_26, ytd_procedures_25, apr_revenue_26,
   ytd_revenue_26, ytd_revenue_25, ytd_vs_py_pct, ytd_vs_budget_pct)
VALUES
  ('${safeName}', ${form.vintage}, '${form.fee_structure}', '${form.carveout}',
   ${eesVal}, '${form.period}',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL);`)
    }
    if (form.add_to_cohort) {
      lines.push(`\nINSERT INTO revenue.cohort_2026
  (client_name, go_live_date, ees, fee_structure, carveout, vintage, period,
   ytd_call_rate, eop_active_cases, ytd_procedures,
   apr_revenue, ytd_revenue, ytd_vs_budget_pct, ytd_vs_model_pct)
VALUES
  ('${safeName}', ${goLive}, ${eesVal}, '${form.fee_structure}', '${form.carveout}',
   ${form.vintage}, '${form.period}',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL);`)
    }
    return lines.join('\n')
  }

  async function handleSubmit() {
    if (!form.client_name || !form.vintage || !form.fee_structure || !form.carveout) {
      setStatus({ type: 'err', msg: 'Client name, vintage, fee structure and carve-out are required.' })
      return
    }
    if (!form.add_to_top50 && !form.add_to_cohort) {
      setStatus({ type: 'err', msg: 'Select at least one table to insert into.' })
      return
    }
    setStatus({ type: 'loading', msg: 'Writing to Databricks…' })
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify({ ...form, ees: form.ees ? parseInt(form.ees) : null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setStatus({ type: 'ok', msg: `"${form.client_name}" added successfully. The dashboard will reflect this on its next refresh.` })
      setForm(EMPTY)
      setShowSQL(false)
    } catch (err) {
      setStatus({ type: 'err', msg: (err as Error).message })
    }
  }

  const inputStyle: React.CSSProperties = {
    fontSize: 13, padding: '7px 10px', border: '1px solid #ddd',
    borderRadius: 6, outline: 'none', width: '100%', fontFamily: 'inherit',
    background: '#fff', color: '#111',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: '#777', textTransform: 'uppercase',
    letterSpacing: '0.05em', fontWeight: 500, marginBottom: 4, display: 'block',
  }

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", maxWidth: 680, margin: '40px auto', padding: '0 24px 60px' }}>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
          Admin · not linked from dashboard
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.3px', margin: 0 }}>Add client to Databricks</h1>
        <p style={{ fontSize: 13, color: '#666', marginTop: 8, lineHeight: 1.6 }}>
          This form writes directly to your Databricks tables via the server-side API.
          Numeric actuals (procedures, revenue) start as NULL and will be populated when you upload your actuals file.
          The dashboard auto-refreshes every 15 minutes.
        </p>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e8e8e4', borderRadius: 10, padding: '22px 24px', marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Client name *</label>
            <input style={inputStyle} value={form.client_name}
              onChange={e => set('client_name', e.target.value)} placeholder="e.g. Acme Corporation" />
          </div>

          <div>
            <label style={labelStyle}>Eligible employees (EEs)</label>
            <input style={inputStyle} type="number" value={form.ees}
              onChange={e => set('ees', e.target.value)} placeholder="e.g. 12000" />
          </div>

          <div>
            <label style={labelStyle}>Go-live date</label>
            <input style={inputStyle} type="date" value={form.go_live_date}
              onChange={e => set('go_live_date', e.target.value)} />
          </div>

          {([
            { label: 'Vintage *', field: 'vintage' as const, opts: VINTAGES },
            { label: 'Fee structure *', field: 'fee_structure' as const, opts: FEES },
            { label: 'Carve-out *', field: 'carveout' as const, opts: CARVEOUTS },
            { label: 'Reporting period', field: 'period' as const, opts: PERIODS },
          ] as { label: string; field: keyof ClientForm; opts: string[] }[]).map(({ label, field, opts }) => (
            <div key={field}>
              <label style={labelStyle}>{label}</label>
              <select style={inputStyle} value={form[field] as string}
                onChange={e => set(field, e.target.value)}>
                <option value="">Select…</option>
                {opts.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          ))}

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Insert into</label>
            <div style={{ display: 'flex', gap: 20, marginTop: 4 }}>
              {[
                { field: 'add_to_top50' as const, label: 'Top 50 clients table' },
                { field: 'add_to_cohort' as const, label: '2026 cohort table' },
              ].map(({ field, label }) => (
                <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form[field] as boolean}
                    onChange={e => set(field, e.target.checked)}
                    style={{ width: 15, height: 15 }} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {status.type !== 'idle' && (
        <div style={{
          padding: '10px 14px', borderRadius: 6, fontSize: 13, marginBottom: 14,
          background: status.type === 'ok' ? '#dcfce7' : status.type === 'err' ? '#fee2e2' : '#eff6ff',
          color: status.type === 'ok' ? '#166534' : status.type === 'err' ? '#991b1b' : '#1e3a6e',
          border: `1px solid ${status.type === 'ok' ? '#bbf7d0' : status.type === 'err' ? '#fecaca' : '#bfdbfe'}`,
        }}>
          {status.type === 'loading' && '⟳ '}{status.msg}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={handleSubmit}
          disabled={status.type === 'loading'}
          style={{
            fontSize: 13, fontWeight: 600, padding: '9px 22px',
            background: status.type === 'loading' ? '#666' : '#111',
            color: '#fff', border: 'none', borderRadius: 6,
            cursor: status.type === 'loading' ? 'not-allowed' : 'pointer',
          }}
        >
          {status.type === 'loading' ? 'Writing…' : 'Write to Databricks'}
        </button>
        <button
          onClick={() => setShowSQL(s => !s)}
          style={{
            fontSize: 13, padding: '9px 18px', background: '#fff',
            border: '1px solid #ddd', borderRadius: 6, cursor: 'pointer', color: '#333',
          }}
        >
          {showSQL ? 'Hide SQL' : 'Preview SQL'}
        </button>
      </div>

      {showSQL && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, color: '#888', fontWeight: 500, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            SQL preview
          </div>
          <pre style={{
            background: '#f5f5f2', border: '1px solid #e8e8e4', borderRadius: 8,
            padding: '14px 16px', fontSize: 12, lineHeight: 1.65,
            overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            margin: 0, fontFamily: 'monospace',
          }}>
            {form.client_name || form.vintage ? generatedSQL() : '— fill in the form above —'}
          </pre>
        </div>
      )}
    </div>
  )
}
