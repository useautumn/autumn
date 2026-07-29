import type { CSSProperties } from "react";
import type {
	BalanceBar,
	CustomerCardData,
	GroupedPlan,
	InvoiceLine,
	UsageSeries,
} from "../data/types.js";
import { statusColor, theme } from "./theme.js";
import { usageChartSvgDataUri } from "./usageChartSvg.js";

/**
 * Pure presentational component for the unfurl card. takumi paints a flex/grid
 * tree (no DOM, no hooks, no recharts) — bespoke static JSX styled with the
 * shared brand tokens. Width is fixed; height grows with content.
 */

export const CARD_WIDTH = 1100;
const CHART_HEIGHT = 90;
const MAX_FLAGS = 40;

const col = (style?: CSSProperties): CSSProperties => ({
	display: "flex",
	flexDirection: "column",
	...style,
});
const row = (style?: CSSProperties): CSSProperties => ({
	display: "flex",
	flexDirection: "row",
	...style,
});

const invoiceStatusColor: Record<string, string> = {
	paid: theme.positive,
	open: theme.warning,
	draft: theme.subtle,
	void: theme.subtle,
	uncollectible: theme.danger,
};

function Pill({ text, color }: { text: string; color: string }) {
	return (
		<div
			style={{
				display: "flex",
				color,
				border: `1px solid ${color}`,
				borderRadius: 999,
				padding: "2px 12px",
				fontSize: 18,
				fontWeight: 600,
			}}
		>
			{text}
		</div>
	);
}

function SectionLabel({ text }: { text: string }) {
	return (
		<span style={{ color: theme.muted, fontSize: 20, fontWeight: 600 }}>
			{text}
		</span>
	);
}

function PlanRow({ plan }: { plan: GroupedPlan }) {
	return (
		<div
			style={row({
				justifyContent: "space-between",
				alignItems: "center",
				padding: "14px 18px",
				backgroundColor: theme.surface,
				border: `1px solid ${theme.border}`,
				borderRadius: 12,
			})}
		>
			<div style={row({ alignItems: "center", gap: 10 })}>
				<span style={{ fontSize: 26, fontWeight: 700 }}>{plan.name}</span>
				{plan.count > 1 ? (
					<span
						style={{
							fontSize: 20,
							fontWeight: 700,
							color: theme.purple,
							backgroundColor: theme.purpleSoft,
							borderRadius: 8,
							padding: "2px 10px",
						}}
					>
						×{plan.count}
					</span>
				) : null}
			</div>
			<div style={row({ alignItems: "center", gap: 16 })}>
				<span style={{ fontSize: 22, color: theme.muted }}>
					{plan.priceLabel}
				</span>
				<Pill
					text={plan.status.toUpperCase()}
					color={statusColor[plan.status] ?? theme.muted}
				/>
			</div>
		</div>
	);
}

function BalanceRow({ balance }: { balance: BalanceBar }) {
	// Over-limit: fill the whole bar in the danger colour to signal maxed + over.
	const fillPct = balance.over
		? 100
		: balance.unlimited
			? 100
			: Math.round(balance.fraction * 100);
	const fillColor = balance.over ? theme.danger : theme.purple;
	return (
		<div style={col({ gap: 8 })}>
			<div style={row({ justifyContent: "space-between", alignItems: "center" })}>
				<span style={{ fontSize: 22, fontWeight: 600 }}>{balance.feature}</span>
				<div style={row({ alignItems: "center", gap: 10 })}>
					<span style={{ fontSize: 20, color: theme.muted }}>{balance.label}</span>
					{balance.overageLabel ? (
						<span
							style={{ fontSize: 20, fontWeight: 600, color: theme.danger }}
						>
							{balance.overageLabel}
						</span>
					) : null}
				</div>
			</div>
			<div
				style={{
					display: "flex",
					width: "100%",
					height: 12,
					backgroundColor: theme.track,
					borderRadius: 999,
				}}
			>
				<div
					style={{
						display: "flex",
						width: `${fillPct}%`,
						height: "100%",
						backgroundColor: fillColor,
						borderRadius: 999,
					}}
				/>
			</div>
		</div>
	);
}

function UsageChart({ usage }: { usage: UsageSeries }) {
	const first = usage.points[0]?.label;
	const last = usage.points[usage.points.length - 1]?.label;
	return (
		<div style={col({ gap: 8 })}>
			<div style={row({ justifyContent: "space-between", alignItems: "center" })}>
				<SectionLabel text="Usage (7d)" />
				<div style={row({ alignItems: "center", gap: 10 })}>
					<span style={{ fontSize: 20, color: theme.muted }}>
						{usage.featureLabel}
					</span>
					<span style={{ fontSize: 24, fontWeight: 700, color: theme.purple }}>
						{formatCompact(usage.total)}
					</span>
				</div>
			</div>
			<img
				src={usageChartSvgDataUri(usage.points, { height: CHART_HEIGHT })}
				alt="usage"
				style={{ display: "flex", width: "100%", height: CHART_HEIGHT }}
			/>
			<div style={row({ justifyContent: "space-between" })}>
				<span style={{ fontSize: 15, color: theme.subtle }}>{first}</span>
				<span style={{ fontSize: 15, color: theme.subtle }}>{last}</span>
			</div>
		</div>
	);
}

function FlagChips({ flags }: { flags: string[] }) {
	const shown = flags.slice(0, MAX_FLAGS);
	const overflow = flags.length - shown.length;
	return (
		<div style={col({ gap: 12 })}>
			<SectionLabel text={`Flags (${flags.length})`} />
			<div style={row({ gap: 8, flexWrap: "wrap" })}>
				{shown.map((flag) => (
					<div
						key={flag}
						style={{
							display: "flex",
							fontSize: 16,
							color: theme.foreground,
							backgroundColor: theme.surface,
							border: `1px solid ${theme.border}`,
							borderRadius: 8,
							padding: "5px 12px",
						}}
					>
						{flag}
					</div>
				))}
				{overflow > 0 ? (
					<div
						style={{
							display: "flex",
							fontSize: 16,
							color: theme.muted,
							padding: "5px 12px",
						}}
					>
						+{overflow} more
					</div>
				) : null}
			</div>
		</div>
	);
}

const INVOICE_TOTAL_COL = 200;
const INVOICE_DATE_COL = 170;

function InvoiceHeader() {
	const cell: CSSProperties = {
		fontSize: 16,
		color: theme.subtle,
		textTransform: "uppercase",
	};
	return (
		<div
			style={row({
				alignItems: "center",
				paddingBottom: 8,
				borderBottom: `1px solid ${theme.border}`,
			})}
		>
			<span style={{ ...cell, flex: 1 }}>Products</span>
			<span style={{ ...cell, width: INVOICE_TOTAL_COL, textAlign: "right" }}>
				Total
			</span>
			<span style={{ ...cell, width: INVOICE_DATE_COL, textAlign: "right" }}>
				Created
			</span>
		</div>
	);
}

function InvoiceRow({ invoice }: { invoice: InvoiceLine }) {
	const status = invoice.status ?? "unknown";
	const statusColr = invoiceStatusColor[status] ?? theme.subtle;
	return (
		<div
			style={row({
				alignItems: "center",
				padding: "12px 0",
				borderBottom: `1px solid ${theme.border}`,
			})}
		>
			<div style={row({ flex: 1, alignItems: "center", gap: 12 })}>
				<span style={{ fontSize: 21, fontWeight: 700 }}>{invoice.products}</span>
				<span
					style={{
						fontSize: 17,
						fontWeight: 400,
						color: statusColr,
						textTransform: "capitalize",
					}}
				>
					{status}
				</span>
			</div>
			<span
				style={{
					width: INVOICE_TOTAL_COL,
					textAlign: "right",
					fontSize: 20,
					fontWeight: 600,
				}}
			>
				{invoice.totalLabel}
			</span>
			<span
				style={{
					width: INVOICE_DATE_COL,
					textAlign: "right",
					fontSize: 18,
					color: theme.subtle,
				}}
			>
				{formatDate(invoice.createdAt)}
			</span>
		</div>
	);
}

export function CustomerCard({ data }: { data: CustomerCardData }) {
	const primaryStatus = data.plans[0]?.status;
	return (
		<div
			style={col({
				width: CARD_WIDTH,
				backgroundColor: theme.bg,
				padding: 44,
				gap: 30,
				fontFamily: "sans-serif",
				color: theme.foreground,
			})}
		>
			{/* Header */}
			<div style={row({ justifyContent: "space-between", alignItems: "flex-start" })}>
				<div style={col({ gap: 6 })}>
					<span style={{ fontSize: 46, fontWeight: 800 }}>{data.name}</span>
					<span style={{ color: theme.muted, fontSize: 20 }}>
						{data.email ?? data.customerId}
					</span>
				</div>
				<div style={col({ alignItems: "flex-end", gap: 10 })}>
					{primaryStatus ? (
						<Pill
							text={primaryStatus.toUpperCase()}
							color={statusColor[primaryStatus] ?? theme.muted}
						/>
					) : null}
					<span style={{ fontSize: 20, color: theme.muted }}>
						{data.entityCount} {data.entityCount === 1 ? "entity" : "entities"}
					</span>
				</div>
			</div>

			{/* Plans */}
			{data.plans.length > 0 ? (
				<div style={col({ gap: 12 })}>
					<SectionLabel text="Plans" />
					{data.plans.map((plan) => (
						<PlanRow key={plan.name} plan={plan} />
					))}
				</div>
			) : null}

			{/* Balances */}
			{data.balances.length > 0 ? (
				<div style={col({ gap: 16 })}>
					<SectionLabel text="Balances" />
					{data.balances.map((balance) => (
						<BalanceRow key={balance.feature} balance={balance} />
					))}
				</div>
			) : null}

			{/* Usage */}
			{data.usage && data.usage.points.length > 0 ? (
				<UsageChart usage={data.usage} />
			) : null}

			{/* Flags */}
			{data.featureFlags.length > 0 ? (
				<FlagChips flags={data.featureFlags} />
			) : null}

			{/* Invoices */}
			{data.invoices.length > 0 ? (
				<div style={col({ gap: 4 })}>
					<SectionLabel text="Invoices" />
					<InvoiceHeader />
					{data.invoices.map((invoice, index) => (
						<InvoiceRow key={`${invoice.createdAt}-${index}`} invoice={invoice} />
					))}
				</div>
			) : null}

			{/* Footer */}
			<span style={{ color: theme.subtle, fontSize: 15 }}>
				{data.orgId} · {data.customerId}
			</span>
		</div>
	);
}

const formatCompact = (value: number): string => {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
	return String(Math.round(value));
};

const formatDate = (iso: string): string => {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
};
