import { ChartBarIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import {
	Bar,
	BarChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

const CHART_COLORS = [
	"#6366f1",
	"#22d3ee",
	"#a78bfa",
	"#34d399",
	"#fb923c",
	"#f472b6",
	"#facc15",
	"#60a5fa",
	"#f87171",
	"#4ade80",
	"#818cf8",
	"#2dd4bf",
	"#c084fc",
	"#fbbf24",
	"#38bdf8",
	"#e879f9",
	"#a3e635",
	"#f97316",
	"#94a3b8",
	"#14b8a6",
];

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
	payload?: Array<{ name: string; value: number; color: string }>;
	label?: string;
	currency: string;
}) {
	if (!active || !payload?.length) return null;

	return (
		<div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
			<p className="mb-1 font-medium text-t2">{label}</p>
			{payload.map((entry) => (
				<div key={entry.name} className="flex items-center gap-2">
					<span
						className="inline-block h-2 w-2 rounded-full"
						style={{ backgroundColor: entry.color }}
					/>
					<span className="text-t3">{entry.name}:</span>
					<span className="font-medium text-t1">
						{formatCurrency({ value: entry.value, currency })}
					</span>
				</div>
			))}
		</div>
	);
}

const GRANULARITY_OPTIONS = [
	{ value: "day", label: "Daily" },
	{ value: "month", label: "Monthly" },
	{ value: "year", label: "Yearly" },
] as const;

export function RevenueByProductChart({
	data,
	loading,
	granularity,
	setGranularity,
}: {
	data: Array<{
		period_label: string;
		product_name: string;
		volume: number;
		currency: string;
	}>;
	loading: boolean;
	granularity: "day" | "month" | "year";
	setGranularity: (g: "day" | "month" | "year") => void;
}) {
	const { pivotedData, productNames, currency } = useMemo(() => {
		if (!data.length) {
			return { pivotedData: [], productNames: [], currency: "usd" };
		}

		const cur = data[0].currency || "usd";
		const names = [...new Set(data.map((d) => d.product_name))];

		const grouped: Record<string, Record<string, number>> = {};
		for (const row of data) {
			if (!grouped[row.period_label]) {
				grouped[row.period_label] = {};
			}
			grouped[row.period_label][row.product_name] =
				(grouped[row.period_label][row.product_name] || 0) + row.volume;
		}

		const pivoted = Object.entries(grouped)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([period, products]) => ({
				period,
				...products,
			}));

		return { pivotedData: pivoted, productNames: names, currency: cur };
	}, [data]);

	const isEmpty = !loading && pivotedData.length === 0;

	return (
		<div>
			<div className="flex flex-wrap items-center gap-2 min-h-10 pb-4">
				<div className="text-t3 text-md flex gap-2 items-center">
					<ChartBarIcon size={16} weight="fill" className="text-subtle" />
					Revenue by Product
				</div>
				<div className="flex items-center gap-1 ml-auto">
					{GRANULARITY_OPTIONS.map((g) => (
						<button
							key={g.value}
							type="button"
							onClick={() => setGranularity(g.value)}
							className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
								granularity === g.value
									? "bg-interactive-secondary text-t1 font-medium border"
									: "text-t3 hover:text-t2"
							}`}
						>
							{g.label}
						</button>
					))}
				</div>
			</div>
			<div className="border rounded-lg overflow-hidden bg-interactive-secondary p-4">
				{loading && <div className="h-[260px] w-full shimmer rounded" />}

				{isEmpty && (
					<div className="h-[260px] flex items-center justify-center">
						<p className="text-sm text-t3">No revenue data</p>
					</div>
				)}

				{!loading && pivotedData.length > 0 && (
					<ResponsiveContainer width="100%" height={260}>
						<BarChart data={pivotedData} barCategoryGap={4}>
							<CartesianGrid
								vertical={false}
								strokeDasharray="2 2"
								className="stroke-border"
							/>
							<XAxis
								dataKey="period"
								tickLine={false}
								axisLine={false}
								tick={{ fontSize: 11 }}
								tickMargin={4}
								className="fill-t3"
								interval="equidistantPreserveStart"
							/>
							<YAxis
								tickLine={false}
								axisLine={false}
								width={60}
								tick={{ fontSize: 11 }}
								className="fill-t3"
								tickFormatter={(v: number) =>
									formatCurrency({ value: v, currency })
								}
							/>
							<Tooltip content={<CustomTooltip currency={currency} />} />
							{productNames.map((name, i) => (
								<Bar
									key={name}
									dataKey={name}
									stackId="revenue"
									fill={CHART_COLORS[i % CHART_COLORS.length]}
									radius={
										i === productNames.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]
									}
								/>
							))}
						</BarChart>
					</ResponsiveContainer>
				)}
			</div>
		</div>
	);
}
