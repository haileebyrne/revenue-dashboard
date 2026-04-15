"use client";
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function Dashboard() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/databricks")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setData(json.data);
        setLoading(false);
      })
      .catch(() => { setError("Failed to load"); setLoading(false); });
  }, []);

  if (loading) return <div style={{padding:"2rem"}}>Loading data from Databricks...</div>;
  if (error) return <div style={{padding:"2rem",color:"red"}}>Error: {error}</div>;

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Revenue Dashboard</h1>
      <h2>Chart</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data.slice(0, 20)}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="pickup_zip" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="fare_amount" fill="#6366f1" />
        </BarChart>
      </ResponsiveContainer>
      <h2>Table</h2>
      <div style={{ overflowX: "auto" }}>
        <table border={1} cellPadding={8} style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "#f3f4f6" }}>
            <tr>{data[0] && Object.keys(data[0]).map((col) => <th key={col}>{col}</th>)}</tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i}>{Object.values(row).map((val: any, j) => <td key={j}>{String(val)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
