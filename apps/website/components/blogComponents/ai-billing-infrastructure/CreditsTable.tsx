"use client";

import type { CSSProperties } from "react";

const MUTED = "#7c7c85";
const TEXT = "#E6E6E9";
const ACCENT = "#b495ff";

type Row = {
	userId: string;
	plan: string;
	balance: string;
	userColor: string;
	planColor: string;
	balanceColor: string;
	isHeader?: boolean;
};

const ROWS: Row[] = [
	{ userId: "user_id", plan: "plan", balance: "balance", userColor: MUTED, planColor: MUTED, balanceColor: MUTED, isHeader: true },
	{ userId: "cus_001", plan: "pro", balance: "847", userColor: TEXT, planColor: TEXT, balanceColor: TEXT },
	{ userId: "cus_002", plan: "free", balance: "12", userColor: TEXT, planColor: TEXT, balanceColor: TEXT },
	{ userId: "cus_003", plan: "scale", balance: "4,203", userColor: TEXT, planColor: ACCENT, balanceColor: ACCENT },
	{ userId: "cus_004", plan: "pro", balance: "560", userColor: TEXT, planColor: TEXT, balanceColor: TEXT },
];

const cellBase: CSSProperties = {
	display: "flex",
	alignItems: "center",
	padding: "0 14px",
	fontSize: 12.5,
};

export function CreditsTable() {
	return (
		<div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
			<div
				style={{
					width: "100%",
					maxWidth: 380,
					borderRadius: 9,
					border: "1px solid #26262c",
					background: "#111114",
					overflow: "hidden",
					fontFamily: "ui-monospace, 'Geist Mono', 'SFMono-Regular', Menlo, monospace",
				}}
			>
				{ROWS.map((row) => (
					<div
						key={row.userId}
						style={{
							display: "flex",
							height: 38,
							borderTop: row.isHeader ? "none" : "1px solid #1f1f25",
						}}
					>
						<div style={{ ...cellBase, width: 140, color: row.userColor }}>{row.userId}</div>
						<div style={{ ...cellBase, flex: 1, color: row.planColor }}>{row.plan}</div>
						<div style={{ ...cellBase, width: 88, justifyContent: "flex-end", color: row.balanceColor }}>
							{row.balance}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
