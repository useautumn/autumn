import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { useAnalyticsContext } from "./AnalyticsContext";
import type { Row } from "./components/analytics-types";
import {
	formatCompactNumber,
	formatDateShort,
	formatHourMinute,
	parseUTCTimestamp,
} from "./utils/parseTimestamp";

interface ChartSeriesConfig {
	xKey: string;
	yKey: string;
	type: "bar";
	stacked: boolean;
	yName: string;
	fill: string;
}

export function EventsBarChart({
	data,
	chartConfig,
}: {
	data: {
		meta: any[];
		rows: number;
		data: Row[];
	};
	chartConfig: ChartSeriesConfig[];
}) {
	const { selectedInterval } = useAnalyticsContext();

	const formatXAxis = (value: string): string => {
		const date = parseUTCTimestamp(value);
		if (!Number.isFinite(date.getTime())) return value;
		return selectedInterval === "24h"
			? formatHourMinute(date)
			: formatDateShort(date);
	};

	const rechartsConfig: ChartConfig = useMemo(() => {
		const config: ChartConfig = {};
		for (const series of chartConfig) {
			config[series.yKey] = { label: series.yName, color: series.fill };
		}
		return config;
	}, [chartConfig]);

	return (
		<ChartContainer config={rechartsConfig} className="h-full w-full">
			<BarChart data={data.data} className="pt-3 pr-2" barCategoryGap={4}>
				<CartesianGrid
					vertical={false}
					strokeDasharray="2 2"
					stroke="var(--chart-grid-stroke)"
					strokeWidth={1}
				/>
				<XAxis
					dataKey="period"
					tickLine={false}
					tickMargin={4}
					axisLine={false}
					interval="equidistantPreserveStart"
					tick={{ fontSize: 11, fill: "#666" }}
					tickFormatter={formatXAxis}
				/>
				<YAxis
					tickLine={false}
					axisLine={false}
					width={40}
					tickMargin={0}
					tickCount={5}
					tick={{ fontSize: 11, fill: "#666", textAnchor: "middle", dx: -15, dy: -3 }}
					tickFormatter={formatCompactNumber}
				/>
				<Tooltip
					content={({ active, payload, label }) => {
						if (!active || !payload?.length) return null;
						const sorted = [...payload].sort(
							(a, b) => (b.value as number) - (a.value as number),
						);
						return (
							<div className="border-border/50 bg-background grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
								<div className="font-medium">
									{formatXAxis(label as string)}
								</div>
								<div className="grid gap-1">
									{sorted.map((item) => {
										const key = String(item.dataKey);
										return (
											<div key={key} className="flex items-center gap-2">
												<span
													className="h-2.5 w-2.5 shrink-0 rounded-sm"
													style={{ background: item.color }}
												/>
												<span className="flex-1 truncate text-t3">
													{rechartsConfig[key]?.label ?? key}
												</span>
												<span className="tabular-nums text-t2">
													{Number(item.value).toLocaleString()}
												</span>
											</div>
										);
									})}
								</div>
							</div>
						);
					}}
				/>
				{chartConfig.map((series) => (
					<Bar
						key={series.yKey}
						dataKey={series.yKey}
						stackId="a"
						fill={series.fill}
						barSize={20}
					/>
				))}
			</BarChart>
		</ChartContainer>
	);
}
