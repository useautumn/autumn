"use client";

import { useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
	Connector,
	connectorPath,
	DiagramCanvas,
	IconBank,
	IconBranch,
	IconCode,
	IconDoc,
} from "./diagramShared";

const W = 680;
const H = 382;

type TableDef = {
	id: string;
	name: string;
	icon: ReactNode;
	x: number;
	y: number;
	w: number;
	cols: string[];
	rows: string[][];
};

const TABLES: TableDef[] = [
	{
		id: "customers",
		name: "customers",
		icon: <IconDoc />,
		x: 16,
		y: 40,
		w: 320,
		cols: ["id", "plan_id"],
		rows: [
			["cus_001", "pro_v2"],
			["cus_002", "pro_v1"],
		],
	},
	{
		id: "plans",
		name: "plans",
		icon: <IconBank />,
		x: 360,
		y: 24,
		w: 304,
		cols: ["id", "price", "credits"],
		rows: [
			["free", "$0", "50"],
			["pro_v1", "$20", "200"],
			["pro_v2", "$40", "400"],
		],
	},
	{
		id: "entitlements",
		name: "entitlements",
		icon: <IconCode />,
		x: 16,
		y: 232,
		w: 320,
		cols: ["feature", "limit"],
		rows: [
			["seats", "5"],
			["api_calls", "10k"],
		],
	},
	{
		id: "schedules",
		name: "schedules",
		icon: <IconBranch />,
		x: 360,
		y: 232,
		w: 304,
		cols: ["customer", "change"],
		rows: [
			["cus_002", "→ pro_v2"],
			["cus_004", "→ cancel"],
		],
	},
];

// Anchor points (approximate edge midpoints) for the FK connectors.
const CONNECTORS = [
	// customers.plan_id → plans.id
	{ from: { x: 336, y: 102 }, to: { x: 360, y: 102 } },
	// entitlements → customers (left column, vertical)
	{ from: { x: 176, y: 232 }, to: { x: 176, y: 165 } },
	// schedules → plans (right column, vertical)
	{ from: { x: 512, y: 232 }, to: { x: 512, y: 181 } },
];

// Cells that periodically mutate, to convey an ever-evolving billing system.
const MUTATIONS: { key: string; values: string[] }[] = [
	{ key: "plans-2-2", values: ["400", "500", "600", "400"] },
	{ key: "plans-1-1", values: ["$20", "$25", "$20"] },
	{ key: "customers-0-1", values: ["pro_v2", "acme_custom", "pro_v2"] },
	{ key: "entitlements-0-1", values: ["5", "8", "12", "5"] },
	{ key: "schedules-0-1", values: ["→ pro_v2", "→ cancel", "→ pro_v2"] },
	{ key: "entitlements-1-1", values: ["10k", "25k", "50k", "10k"] },
];

function TableCard({
	table,
	overrides,
	flashKey,
}: {
	table: TableDef;
	overrides: Record<string, string>;
	flashKey: string | null;
}) {
	return (
		<div
			className="absolute overflow-hidden rounded-lg border border-[#292929] bg-[#141414]"
			style={{ left: table.x, top: table.y, width: table.w }}
		>
			<div className="flex items-center gap-2 border-b border-[#292929] px-3 py-1.5">
				<span className="text-[#9564ff]">{table.icon}</span>
				<span className="font-mono text-[11px] uppercase tracking-[0.06em] text-[#9564ff]">
					{table.name}
				</span>
			</div>
			<table className="w-full table-fixed font-mono text-[12.5px] leading-[1.6]">
				<thead>
					<tr className="text-[#FFFFFF66]">
						{table.cols.map((col) => (
							<th className="px-3 py-1.5 text-left font-normal" key={col}>
								{col}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{table.rows.map((row, r) => (
						<tr className="border-t border-[#1f1f1f]" key={row[0]}>
							{row.map((cell, c) => {
								const key = `${table.id}-${r}-${c}`;
								const value = overrides[key] ?? cell;
								const flashing = flashKey === key;
								return (
									<td
										className={cn(
											"px-3 py-1.5 transition-colors duration-300",
											flashing ? "text-[#9564ff]" : "text-[#E5E5E5]",
										)}
										key={key}
									>
										{value}
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export function PostgresTablesHero() {
	const reduce = useReducedMotion();
	const [overrides, setOverrides] = useState<Record<string, string>>({});
	const [flashKey, setFlashKey] = useState<string | null>(null);
	const idxRef = useRef<Record<string, number>>({});

	useEffect(() => {
		if (reduce) {
			return;
		}
		const interval = setInterval(() => {
			const mutation = MUTATIONS[Math.floor(Math.random() * MUTATIONS.length)];
			const next = (idxRef.current[mutation.key] ?? 0) + 1;
			idxRef.current[mutation.key] = next;
			const value = mutation.values[next % mutation.values.length];
			setOverrides((prev) => ({ ...prev, [mutation.key]: value }));
			setFlashKey(mutation.key);
		}, 850);
		return () => clearInterval(interval);
	}, [reduce]);

	useEffect(() => {
		if (!flashKey) {
			return;
		}
		const t = setTimeout(() => setFlashKey(null), 450);
		return () => clearTimeout(t);
	}, [flashKey]);

	return (
		<div className="not-prose overflow-hidden rounded-xl border border-[#292929] bg-[#0F0F0F]">
			<DiagramCanvas
				connectors={CONNECTORS.map((conn) => {
					const key = `${conn.from.x}-${conn.from.y}-${conn.to.x}-${conn.to.y}`;
					return (
						<g key={key}>
							<Connector active from={conn.from} reduce={reduce} to={conn.to} />
							{!reduce && (
								<circle fill="#9564ff" r={3}>
									<animateMotion
										dur="1.6s"
										path={connectorPath(conn.from, conn.to)}
										repeatCount="indefinite"
									/>
								</circle>
							)}
						</g>
					);
				})}
				height={H}
				padClassName="px-3 py-3"
				width={W}
			>
				{TABLES.map((table) => (
					<TableCard
						flashKey={flashKey}
						key={table.id}
						overrides={overrides}
						table={table}
					/>
				))}
			</DiagramCanvas>
		</div>
	);
}
