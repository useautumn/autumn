import { ChartPieIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

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
	currency,
}: {
	active?: boolean;
	payload?: Array<{
		name: string;
		value: number;
		payload: { product_name: string; volume: number; percent: number };
	}>;
	currency: string;
}) {
	if (!active || !payload?.length) return null;

	const entry = payload[0].payload;
	return (
		<div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
			<p className="font-medium text-t2">{entry.product_name}</p>
			<p className="text-t3">
				{formatCurrency({ value: entry.volume, currency })} (
				{entry.percent.toFixed(1)}%)
			</p>
		</div>
	);
}

export function RevenueProductShareChart({
	data,
	loading,
}: {
	data: Array<{ product_name: string; volume: number; currency: string }>;
	loading: boolean;
}) {
	const { slices, currency } = useMemo(() => {
		if (!data.length) {
			return { slices: [], currency: "usd" };
		}

		const cur = data[0].currency || "usd";
		const total = data.reduce((sum, d) => sum + d.volume, 0);

		if (total === 0) {
			return { slices: [], currency: cur };
		}

		const withPercent = data.map((d) => ({
			...d,
			percent: (d.volume / total) * 100,
		}));

		const significant = withPercent.filter((d) => d.percent >= 2);
		const small = withPercent.filter((d) => d.percent < 2);

		const result = [...significant];
		if (small.length > 0) {
			const otherVolume = small.reduce((sum, d) => sum + d.volume, 0);
			result.push({
				product_name: "Other",
				volume: otherVolume,
				currency: cur,
				percent: (otherVolume / total) * 100,
			});
		}

		return { slices: result, currency: cur };
	}, [data]);

	const isEmpty = !loading && slices.length === 0;

	return (
		<div className="flex flex-col">
			<div className="flex flex-wrap items-center gap-2 min-h-10 pb-4">
				<div className="text-t3 text-md flex gap-2 items-center">
					<ChartPieIcon size={16} weight="fill" className="text-subtle" />
					Revenue Share
				</div>
			</div>
			<div className="border rounded-lg overflow-hidden bg-interactive-secondary p-4 flex items-center justify-center min-h-[260px] flex-1">
				{loading && <div className="h-[220px] w-full shimmer rounded" />}

				{isEmpty && <p className="text-sm text-t3">No data available</p>}

				{!loading && slices.length > 0 && (
					<div className="flex items-center gap-4 w-full">
						<div className="w-[160px] h-[160px] shrink-0">
							<ResponsiveContainer width="100%" height="100%">
								<PieChart>
									<Pie
										data={slices}
										dataKey="volume"
										nameKey="product_name"
										cx="50%"
										cy="50%"
										innerRadius={45}
										outerRadius={72}
										paddingAngle={2}
										strokeWidth={0}
									>
										{slices.map((_, i) => (
											<Cell
												key={slices[i].product_name}
												fill={CHART_COLORS[i % CHART_COLORS.length]}
											/>
										))}
									</Pie>
									<Tooltip content={<CustomTooltip currency={currency} />} />
								</PieChart>
							</ResponsiveContainer>
						</div>
						<div className="flex flex-col gap-1.5 min-w-0 flex-1">
							{slices.map((slice, i) => (
								<div
									key={slice.product_name}
									className="flex items-center gap-2 text-xs"
								>
									<span
										className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
										style={{
											backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
										}}
									/>
									<span className="text-t2 truncate">{slice.product_name}</span>
									<span className="text-t3 ml-auto whitespace-nowrap tabular-nums">
										{formatCurrency({ value: slice.volume, currency })} (
										{slice.percent.toFixed(1)}%)
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
