"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

const MUTED = "#7c7c85";
const TEXT = "#E6E6E9";
const NULLED = "#565660";

const RESET = "2026-07-01";
const EXPIRY = "2027-06-05";
const NONE = "null";

const TABLE_WIDTH = 568;

type Row = {
	id: string;
	userId: string;
	source: string;
	balance: string;
	resetsAt: string;
	expiresAt: string;
	isHeader?: boolean;
};

const ROWS: Row[] = [
	{ id: "header", userId: "user_id", source: "source", balance: "balance", resetsAt: "resets_at", expiresAt: "expires_at", isHeader: true },
	{ id: "r1", userId: "usr_1a2b", source: "subscription", balance: "100", resetsAt: RESET, expiresAt: NONE },
	{ id: "r2", userId: "usr_3c4d", source: "subscription", balance: "100", resetsAt: RESET, expiresAt: NONE },
	{ id: "r3", userId: "usr_3c4d", source: "top_up", balance: "250", resetsAt: NONE, expiresAt: EXPIRY },
	{ id: "r4", userId: "usr_5e6f", source: "subscription", balance: "100", resetsAt: RESET, expiresAt: NONE },
];

const cellBase: CSSProperties = {
	display: "flex",
	alignItems: "center",
	padding: "0 14px",
	fontSize: 12.5,
	whiteSpace: "nowrap",
};

const nullColor = (value: string, isHeader?: boolean) =>
	isHeader ? MUTED : value === NONE ? NULLED : TEXT;

export function CreditBucketsTable() {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [scrollable, setScrollable] = useState(false);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const check = () => setScrollable(el.scrollWidth > el.clientWidth + 1);
		check();
		const observer = new ResizeObserver(check);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	return (
		<div style={{ padding: "20px 0" }}>
			<div style={{ position: "relative", maxWidth: TABLE_WIDTH, margin: "0 auto" }}>
				<div
					ref={scrollRef}
					style={{
						overflowX: "auto",
						borderRadius: 9,
						border: "1px solid #26262c",
						background: "#111114",
					}}
				>
					<div
						style={{
							minWidth: TABLE_WIDTH,
							fontFamily: "ui-monospace, 'Geist Mono', 'SFMono-Regular', Menlo, monospace",
						}}
					>
						{ROWS.map((row) => {
							const base = row.isHeader ? MUTED : TEXT;
							return (
								<div
									key={row.id}
									style={{
										display: "flex",
										height: 38,
										borderTop: row.isHeader ? "none" : "1px solid #1f1f25",
									}}
								>
									<div style={{ ...cellBase, width: 104, color: base }}>{row.userId}</div>
									<div style={{ ...cellBase, width: 132, color: base }}>{row.source}</div>
									<div style={{ ...cellBase, width: 76, color: base }}>{row.balance}</div>
									<div style={{ ...cellBase, width: 128, color: nullColor(row.resetsAt, row.isHeader) }}>{row.resetsAt}</div>
									<div style={{ ...cellBase, width: 128, color: nullColor(row.expiresAt, row.isHeader) }}>{row.expiresAt}</div>
								</div>
							);
						})}
					</div>
				</div>
				{scrollable && (
					<div
						aria-hidden="true"
						style={{
							position: "absolute",
							top: 1,
							right: 1,
							bottom: 1,
							width: 40,
							pointerEvents: "none",
							borderTopRightRadius: 8,
							borderBottomRightRadius: 8,
							background: "linear-gradient(to right, rgba(17,17,20,0), #111114)",
						}}
					/>
				)}
			</div>
		</div>
	);
}
