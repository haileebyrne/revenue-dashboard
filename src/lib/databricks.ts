const CACHE: Record<string, { data: any; ts: number }> = {};
const CACHE_TTL = 1000 * 60 * 30;

function businessDaysInMonth(year: number, month: number): number {
  let count = 0;
  const days = new Date(year, month, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

function businessDayOfMonth(date: Date): number {
  let count = 0;
  const year = date.getFullYear();
  const month = date.getMonth();
  for (let d = 1; d <= date.getDate(); d++) {
    const dow = new Date(year, month, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

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
  const nowDate = new Date();
  const currentBizDay = businessDayOfMonth(nowDate);
  const totalBizDays = businessDaysInMonth(nowDate.getFullYear(), nowDate.getMonth() + 1);
  const isLastBizDay = currentBizDay === totalBizDays;

  if (!isLastBizDay && CACHE[cacheKey] && now - CACHE[cacheKey].ts < CACHE_TTL) {
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

  if (!isLastBizDay) {
    CACHE[cacheKey] = { data, ts: now };
  }
  return data;
}