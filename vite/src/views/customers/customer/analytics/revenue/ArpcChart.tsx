import { TrendUpIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import {
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

const COLOR_ARPC = "#6366f1";
const COLOR_CUSTOMERS = "#22d3ee";

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
	}).format(value);
}

function CustomTooltip({
	active,
	payload,
	label,
	currency,
}: {
	active?: boolean;
	payload?: Array<{
		name: string;
		value: number;
		color: string;
		dataKey: string;
	}>;
	label?: string;
	currency: string;
}) {
	if (!active || !payload?.length) return null;

	return (
		<div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
			<p className="mb-1 font-medium text-t2">{label}</p>
			{payload.map((entry) => (
				<div key={entry.dataKey} className="flex items-center gap-2">
					<span
						className="inline-block h-2 w-2 rounded-full"
						style={{ backgroundColor: entry.color }}
					/>
					<span className="text-t3">
						{entry.dataKey === "arpc" ? "ARPC" : "Customers"}:
					</span>
					<span className="font-medium text-t1">
						{entry.dataKey === "arpc"
							? formatCurrency({ value: entry.value, currency })
							: entry.value.toLocaleString()}
					</span>
				</div>
			))}
		</div>
	);
}

export function ArpcChart({
	data,
	loading,
}: {
	data: Array<{
		period_label: string;
		arpc: number;
		customer_count: number;
		currency: string;
	}>;
	loading: boolean;
}) {
	const currency = useMemo(() => {
		return data[0]?.currency || "usd";
	}, [data]);

	const isEmpty = !loading && data.length === 0;

	return (
		<div>
			<div className="flex flex-wrap items-center gap-2 min-h-10 pb-4">
				<div className="text-t3 text-md flex gap-2 items-center">
					<TrendUpIcon size={16} weight="fill" className="text-subtle" />
					Average Revenue per Customer
				</div>
				<div className="flex items-center gap-3 text-xs text-t3 ml-auto">
					<span className="flex items-center gap-1.5">
						<span
							className="inline-block h-2 w-2 rounded-full"
							style={{ backgroundColor: COLOR_ARPC }}
						/>
						ARPC
					</span>
					<span className="flex items-center gap-1.5">
						<span
							className="inline-block h-2 w-2 rounded-full"
							style={{ backgroundColor: COLOR_CUSTOMERS }}
						/>
						Customers
					</span>
				</div>
			</div>
			<div className="border rounded-lg overflow-hidden bg-interactive-secondary p-4">
				{loading && <div className="h-[260px] w-full shimmer rounded" />}

				{isEmpty && (
					<div className="h-[260px] flex items-center justify-center">
						<p className="text-sm text-t3">No data available</p>
					</div>
				)}

				{!loading && data.length > 0 && (
					<ResponsiveContainer width="100%" height={260}>
						<LineChart data={data}>
							<CartesianGrid
								vertical={false}
								strokeDasharray="2 2"
								className="stroke-border"
							/>
							<XAxis
								dataKey="period_label"
								tickLine={false}
								axisLine={false}
								tick={{ fontSize: 11 }}
								className="fill-t3"
								tickMargin={4}
								interval="equidistantPreserveStart"
							/>
							<YAxis
								yAxisId="arpc"
								orientation="left"
								tickLine={false}
								axisLine={false}
								width={60}
								tick={{ fontSize: 11 }}
								className="fill-t3"
								tickFormatter={(v: number) =>
									formatCurrency({ value: v, currency })
								}
							/>
							<YAxis
								yAxisId="customers"
								orientation="right"
								tickLine={false}
								axisLine={false}
								width={40}
								tick={{ fontSize: 11 }}
								className="fill-t3"
								tickFormatter={(v: number) =>
									v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
								}
							/>
							<Tooltip content={<CustomTooltip currency={currency} />} />
							<Line
								yAxisId="arpc"
								type="monotone"
								dataKey="arpc"
								stroke={COLOR_ARPC}
								strokeWidth={2}
								dot={false}
								activeDot={{ r: 3, strokeWidth: 0 }}
							/>
							<Line
								yAxisId="customers"
								type="monotone"
								dataKey="customer_count"
								stroke={COLOR_CUSTOMERS}
								strokeWidth={2}
								dot={false}
								activeDot={{ r: 3, strokeWidth: 0 }}
							/>
						</LineChart>
					</ResponsiveContainer>
				)}
			</div>
		</div>
	);
}
