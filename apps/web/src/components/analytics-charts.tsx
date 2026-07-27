"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export type QualificationSlice = { name: string; value: number; color: string };

export function FunnelBars({ data }: { data: Array<{ name: string; value: number }> }) {
  const total = Math.max(data[0]?.value ?? 0, 1);
  return <div className="analytics-funnel-bars">{data.map((item) => {
    const percentage = Math.round(item.value / total * 1000) / 10;
    return <div key={item.name}><span><strong>{item.name}</strong><em>{item.value} · {percentage}%</em></span><i><b style={{ width: `${Math.max(2, percentage)}%` }} /></i></div>;
  })}</div>;
}

export function QualificationPie({ data }: { data: QualificationSlice[] }) {
  return <div className="analytics-qualification-pie"><ResponsiveContainer><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={34} outerRadius={52} paddingAngle={1} stroke="#ffffff" strokeWidth={2} isAnimationActive={false}>{data.map((item) => <Cell fill={item.color} key={item.name} />)}</Pie><Tooltip contentStyle={{ border: "1px solid #dfe3e8", borderRadius: 5, background: "#ffffff", color: "#18201e", fontSize: 10 }} /></PieChart></ResponsiveContainer></div>;
}
