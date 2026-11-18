"use client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "@/i18n/provider";
export const SERIES_COLORS = {
    subscriptions: "#8b5cf6",
    ppv: "#0284c7",
    tips: "#d97706",
} as const;
const SURFACE = "#131317";
const GRID = "#26262e";
const MUTED = "#8b8b96";
const tooltipStyle = {
    backgroundColor: "#1a1a20",
    border: "1px solid #26262e",
    borderRadius: 8,
    fontSize: 12,
    color: "#e7e7ea",
} as const;
const usd = (v: number) => `$${v.toLocaleString("en-US")}`;
export interface RevenuePoint {
    date: string;
    subscriptions: number;
    ppv: number;
    tips: number;
}
export function RevenueChart({ data }: {
    data: RevenuePoint[];
}) {
    const { dict } = useI18n();
    const a = dict.analytics;
    return (<ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="0" vertical={false}/>
        <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd"/>
        <YAxis tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={usd} width={56}/>
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#26262e", opacity: 0.35 }} formatter={(value, name) => [usd(Number(value ?? 0)), String(name)]}/>
        <Legend wrapperStyle={{ fontSize: 12, color: MUTED }} iconType="circle" iconSize={8}/>
        <Bar dataKey="subscriptions" name={a.subscriptions} stackId="rev" fill={SERIES_COLORS.subscriptions} stroke={SURFACE} strokeWidth={1} maxBarSize={18}/>
        <Bar dataKey="ppv" name={a.ppv} stackId="rev" fill={SERIES_COLORS.ppv} stroke={SURFACE} strokeWidth={1} maxBarSize={18}/>
        <Bar dataKey="tips" name={a.tips} stackId="rev" fill={SERIES_COLORS.tips} stroke={SURFACE} strokeWidth={1} maxBarSize={18} radius={[3, 3, 0, 0]}/>
      </BarChart>
    </ResponsiveContainer>);
}
export interface SubscriberPoint {
    week: string;
    joined: number;
    churned: number;
}
export function SubscriberChart({ data }: {
    data: SubscriberPoint[];
}) {
    const { dict } = useI18n();
    const a = dict.analytics;
    return (<ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false}/>
        <XAxis dataKey="week" tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }}/>
        <YAxis tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={32}/>
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#26262e", opacity: 0.35 }}/>
        <Legend wrapperStyle={{ fontSize: 12, color: MUTED }} iconType="circle" iconSize={8}/>
        <Bar dataKey="joined" name={a.newSubscribers} fill={SERIES_COLORS.subscriptions} maxBarSize={16} radius={[3, 3, 0, 0]}/>
        <Bar dataKey="churned" name={a.churned} fill={SERIES_COLORS.ppv} maxBarSize={16} radius={[3, 3, 0, 0]}/>
      </BarChart>
    </ResponsiveContainer>);
}
