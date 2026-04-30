const CACHE: Record<string, { data: any; ts: number }> = {};
const CACHE_TTL = 1000 * 60 * 0; // force refresh

async function pollStatement(host: string, token: string, statementId: string): Promise<any> {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(`https://${host}/api/2.0/sql/statements/${statementId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const result = await res.json();
    const state = result.status?.state;
    if (state === 'SUCCEEDED') return result;
    if (state === 'FAILED') throw new Error(result.status?.error?.message || 'Query failed');
  }
  throw new Error('Query timed out after 300 seconds');
}

export async function queryDatabricks(sql: string, cacheKey: string) {
  const now = Date.now();
  if (CACHE[cacheKey] && now - CACHE[cacheKey].ts < CACHE_TTL) {
    return CACHE[cacheKey].data;
  }

  const host = process.env.DATABRICKS_HOST!;
  const token = process.env.DATABRICKS_TOKEN!;
  const warehouseId = process.env.DATABRICKS_HTTP_PATH?.split('/').pop();

  const response = await fetch(`https://${host}/api/2.0/sql/statements`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      warehouse_id: warehouseId,
      statement: sql,
      wait_timeout: '0s',
    }),
  });

  let result = await response.json();
  const state = result.status?.state;

  if (state === 'PENDING' || state === 'RUNNING') {
    result = await pollStatement(host, token, result.statement_id);
  } else if (state === 'FAILED') {
    throw new Error(result.status?.error?.message || 'Query failed');
  }

  const columns = result.manifest?.schema?.columns?.map((c: any) => c.name) || [];
  const rows = result.result?.data_array || [];
  const data = rows.map((row: any[]) =>
    Object.fromEntries(columns.map((col: string, i: number) => [col, row[i]]))
  );

  CACHE[cacheKey] = { data, ts: now };
  return data;
}