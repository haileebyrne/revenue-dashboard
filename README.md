# Revenue Projections Dashboard

Next.js dashboard reading live data from Databricks. Deployed on Vercel.

---

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Add your Databricks credentials
cp .env.local.example .env.local
# Then edit .env.local with your actual values

# 3. Run dev server
npm run dev
# Open http://localhost:3000
```

---

## Environment variables

Set these in `.env.local` locally, and in Vercel under **Project → Settings → Environment Variables** for production.

| Variable | Description |
|---|---|
| `DATABRICKS_HOST` | e.g. `https://adb-1234567890.12.azuredatabricks.net` |
| `DATABRICKS_TOKEN` | Personal access token (dapi...) |
| `DATABRICKS_WAREHOUSE_ID` | SQL warehouse ID (not the full path) |
| `ADMIN_SECRET` | Random string to gate `/admin/clients` |

---

## Deploy to Vercel

```bash
# Install Vercel CLI once
npm install -g vercel

# Login
vercel login

# Deploy (first time — follow the prompts)
vercel

# After adding env vars in Vercel dashboard, deploy to production
vercel --prod
```

Then add your env vars at **vercel.com → your project → Settings → Environment Variables**.

---

## Databricks tables required

Run this DDL in your Databricks SQL editor to create the tables:

```sql
CREATE TABLE IF NOT EXISTS revenue.kpis (
  period              STRING,
  apr_mtd_revenue     DOUBLE,
  apr_month_forecast  DOUBLE,
  apr_mtd_procedures  INT,
  apr_proc_forecast   INT,
  ytd_procedures      INT,
  ytd_revenue         DOUBLE,
  apr_mtd_revenue_vs_py          DOUBLE,
  apr_month_forecast_vs_budget   DOUBLE,
  apr_mtd_procedures_vs_py       DOUBLE,
  apr_proc_forecast_vs_budget    DOUBLE,
  ytd_procedures_vs_py           DOUBLE,
  ytd_revenue_vs_py              DOUBLE
);

CREATE TABLE IF NOT EXISTS revenue.top50_clients (
  period              STRING,
  client_name         STRING,
  vintage             INT,
  fee_structure       STRING,
  carveout            STRING,
  ees                 INT,
  ytd_procedures_26   INT,
  ytd_procedures_25   INT,
  apr_revenue_26      DOUBLE,
  ytd_revenue_26      DOUBLE,
  ytd_revenue_25      DOUBLE,
  ytd_vs_py_pct       DOUBLE,
  ytd_vs_budget_pct   DOUBLE
);

CREATE TABLE IF NOT EXISTS revenue.cohort_2026 (
  period              STRING,
  client_name         STRING,
  go_live_date        STRING,
  ees                 INT,
  fee_structure       STRING,
  carveout            STRING,
  vintage             INT,
  ytd_call_rate       DOUBLE,
  eop_active_cases    INT,
  ytd_procedures      INT,
  apr_revenue         DOUBLE,
  ytd_revenue         DOUBLE,
  ytd_vs_budget_pct   DOUBLE,
  ytd_vs_model_pct    DOUBLE
);
```

Upload your Excel files via **Catalog → Add data → Upload files** in Databricks, mapping columns to these exact names.

---

## Adding clients (admin)

The client input is not visible in the dashboard. To add a client:

1. Go to `/admin/clients?secret=YOUR_ADMIN_SECRET`
2. Fill out the form
3. Copy the generated SQL
4. Run it in Databricks SQL editor

The dashboard will show the new client on the next data refresh (auto-refreshes every 15 min).

---

## Project structure

```
src/
  app/
    page.tsx                  # Dashboard page (server component)
    layout.tsx
    globals.css
    api/
      databricks/route.ts     # Server-side Databricks proxy (token never in browser)
    admin/
      clients/
        page.tsx              # Secret-gated admin page
        AdminClientsClient.tsx
  components/
    DashboardClient.tsx       # Full dashboard UI
    Dashboard.module.css
  lib/
    databricks.ts             # Databricks query helper
    types.ts                  # TypeScript types
    fallback.ts               # Sample data shown before Databricks is wired up
```
