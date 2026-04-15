// src/app/admin/clients/page.tsx
// Not linked from the dashboard. Access via /admin/clients?secret=YOUR_ADMIN_SECRET
// This page generates the SQL INSERT statements you run in Databricks to add clients.

import { redirect } from 'next/navigation'
import AdminClientsClient from './AdminClientsClient'

export default function AdminClientsPage({
  searchParams,
}: {
  searchParams: { secret?: string }
}) {
  const expectedSecret = process.env.ADMIN_SECRET
  if (!expectedSecret || searchParams.secret !== expectedSecret) {
    redirect('/')
  }
  return <AdminClientsClient secret={searchParams.secret ?? ''} />
}
