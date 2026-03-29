import { ReceiptIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const STATUS_COLORS: Record<string, string> = {
	paid: "#22d3ee",
	open: "#facc15",
	void: "#71717a",
	uncollectible: "#f87171",
	draft: "#a78bfa",
};

const DEFAULT_STATUS_COLOR = "#94a3b8";

function formatCurrency({
	value,
	currency,
}: {
	value: number;
	currency: string;
}) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(value / 100);
}

function CustomTooltip({
	active,
	payload,
	currency,
}: {
	active?: boolean;
	payload?: Array<{
		name: string;
		value: number;
		payload: {
			status: string;
			invoice_count: number;
			total_volume: number;
		};
	}>;
	currency: string;
}) {
	if (!active || !payload?.length) return null;

	const entry = payload[0].payload;
	return (
		<div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
			<p className="font-medium text-t2 capitalize">{entry.status}</p>
			<p className="text-t3">
				{entry.invoice_count} invoice{entry.invoice_count !== 1 ? "s" : ""}{" "}
				&middot; {formatCurrency({ value: entry.total_volume, currency })}
			</p>
		</div>
	);
}

export function InvoiceStatusChart({
	data,
	loading,
}: {
	data: Array<{
		status: string;
		invoice_count: number;
		total_volume: number;
		currency: string;
	}>;
	loading: boolean;
}) {
	const { slices, currency, totalInvoices } = useMemo(() => {
		if (!data.length) {
			return { slices: [], currency: "usd", totalInvoices: 0 };
		}

		const cur = data[0].currency || "usd";
		const total = data.reduce((sum, d) => sum + d.invoice_count, 0);

		return { slices: data, currency: cur, totalInvoices: total };
	}, [data]);

	const isEmpty = !loading && slices.length === 0;

	return (
		<div className="flex flex-col">
			<div className="flex flex-wrap items-center gap-2 min-h-10 pb-4">
				<div className="text-t3 text-md flex gap-2 items-center">
					<ReceiptIcon size={16} weight="fill" className="text-subtle" />
					Invoice Status
				</div>
			</div>
			<div className="border rounded-lg overflow-hidden bg-interactive-secondary p-4 flex items-center justify-center min-h-[260px] flex-1">
				{loading && <div className="h-[220px] w-full shimmer rounded" />}

				{isEmpty && <p className="text-sm text-t3">No data available</p>}

				{!loading && slices.length > 0 && (
					<div className="flex items-center gap-4 w-full">
						<div className="w-[160px] h-[160px] shrink-0 relative">
							<ResponsiveContainer width="100%" height="100%">
								<PieChart>
									<Pie
										data={slices}
										dataKey="invoice_count"
										nameKey="status"
										cx="50%"
										cy="50%"
										innerRadius={45}
										outerRadius={72}
										paddingAngle={2}
										strokeWidth={0}
									>
										{slices.map((entry) => (
											<Cell
												key={entry.status}
												fill={
													STATUS_COLORS[entry.status.toLowerCase()] ||
													DEFAULT_STATUS_COLOR
												}
											/>
										))}
									</Pie>
									<Tooltip
										content={<CustomTooltip currency={currency} />}
										wrapperStyle={{ zIndex: 50 }}
									/>
								</PieChart>
							</ResponsiveContainer>
							<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
								<div className="text-center">
									<p className="text-lg font-semibold text-t1 tabular-nums">
										{totalInvoices}
									</p>
									<p className="text-[10px] text-t3">invoices</p>
								</div>
							</div>
						</div>
						<div className="flex flex-col gap-1.5 min-w-0 flex-1">
							{slices.map((slice) => (
								<div
									key={slice.status}
									className="flex items-center gap-2 text-xs"
								>
									<span
										className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
										style={{
											backgroundColor:
												STATUS_COLORS[slice.status.toLowerCase()] ||
												DEFAULT_STATUS_COLOR,
										}}
									/>
									<span className="text-t2 capitalize">{slice.status}</span>
									<span className="text-t3 ml-auto whitespace-nowrap tabular-nums">
										{slice.invoice_count} &middot;{" "}
										{formatCurrency({
											value: slice.total_volume,
											currency,
										})}
									</span>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
