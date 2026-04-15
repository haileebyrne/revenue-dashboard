// src/lib/databricks.ts
// All Databricks calls happen server-side only — token never reaches the browser.

const HOST = process.env.DATABRICKS_HOST!
const TOKEN = process.env.DATABRICKS_TOKEN!
const WAREHOUSE_ID = process.env.DATABRICKS_WAREHOUSE_ID!

export interface DatabricksColumn {
  name: string
  type_name: string
}

export interface DatabricksResult {
  columns: DatabricksColumn[]
  rows: (string | null)[][]
}

export async function runQuery(sql: string): Promise<DatabricksResult> {
  if (!HOST || !TOKEN || !WAREHOUSE_ID) {
    throw new Error('Databricks env vars not configured. Set DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_WAREHOUSE_ID.')
  }

  const submitRes = await fetch(`${HOST}/api/2.0/sql/statements`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      warehouse_id: WAREHOUSE_ID,
      statement: sql,
      wait_timeout: '30s',
      on_wait_timeout: 'CANCEL',
      format: 'JSON_ARRAY',
    }),
  })

  if (!submitRes.ok) {
    const err = await submitRes.text()
    throw new Error(`Databricks HTTP ${submitRes.status}: ${err}`)
  }

  const data = await submitRes.json()

  if (data.status?.state === 'FAILED') {
    throw new Error(data.status.error?.message || 'Query failed')
  }

  const columns: DatabricksColumn[] =
    data.manifest?.schema?.columns?.map((c: { name: string; type_name: string }) => ({
      name: c.name,
      type_name: c.type_name,
    })) ?? []

  const rows: (string | null)[][] = data.result?.data_array ?? []

  return { columns, rows }
}

// Convert a row array + column defs into a plain object
export function rowToObject(
  columns: DatabricksColumn[],
  row: (string | null)[]
): Record<string, string | number | null> {
  const obj: Record<string, string | number | null> = {}
  columns.forEach((col, i) => {
    const raw = row[i]
    if (raw === null || raw === undefined) {
      obj[col.name] = null
    } else if (['INT', 'BIGINT', 'DOUBLE', 'FLOAT', 'DECIMAL', 'LONG'].includes(col.type_name)) {
      obj[col.name] = parseFloat(raw)
    } else {
      obj[col.name] = raw
    }
  })
  return obj
}
