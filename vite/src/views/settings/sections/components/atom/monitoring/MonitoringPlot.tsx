import {
	CartesianGrid,
	ComposedChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type {
	AtomMetricsChartData,
	AtomMetricsRow,
	AtomMetricsSeries,
} from "./atomMetricsChartData";
import { formatMetricsWindow } from "./atomMetricsFormat";

const TICK = { fontSize: 11, fill: "#666" } as const;

type FormatValue = (value: number | null) => string;

/** The hovered bucket's time window and each series' value in it. */
const MonitoringTooltip = ({
	row,
	series,
	formatValue,
	unit,
}: {
	row: AtomMetricsRow;
	series: AtomMetricsSeries[];
	formatValue: FormatValue;
	unit?: string;
}) => (
	<div className="grid min-w-44 gap-1.5 rounded-lg bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10">
		<div className="flex items-center justify-between gap-3">
			<span className="font-medium">{formatMetricsWindow(row)}</span>
			{unit && <span className="text-subtle">{unit}</span>}
		</div>
		{series.map(({ key, label, color }) => (
			<div key={key} className="flex items-center gap-2">
				<span
					className="size-2.5 shrink-0 rounded-sm"
					style={{ background: color }}
				/>
				<span className="flex-1 text-tertiary-foreground">{label}</span>
				<span className="tabular-nums text-muted-foreground">
					{formatValue(row[key])}
				</span>
			</div>
		))}
	</div>
);

/** The time axis, value axis, grid and hover both monitoring charts share; the series are its children. */
export const MonitoringPlot = ({
	chartData,
	series,
	yTicks,
	formatValue,
	unit,
	children,
}: {
	chartData: AtomMetricsChartData;
	series: AtomMetricsSeries[];
	yTicks: number[];
	formatValue: FormatValue;
	/** Shown beside the hovered window, for values the formatter leaves bare. */
	unit?: string;
	children: React.ReactNode;
}) => {
	const { rows, timeAxis } = chartData;
	return (
		<ResponsiveContainer width="100%" height="100%">
			<ComposedChart
				data={rows}
				margin={{ top: 6, right: 6, bottom: 0, left: 0 }}
			>
				<CartesianGrid
					vertical={false}
					strokeDasharray="2 2"
					stroke="var(--chart-grid-stroke)"
				/>
				<XAxis
					dataKey="x"
					type="number"
					scale="time"
					domain={timeAxis.domain}
					ticks={timeAxis.ticks}
					tickFormatter={timeAxis.formatTick}
					tick={TICK}
					tickLine={false}
					axisLine={false}
					tickMargin={6}
				/>
				<YAxis
					domain={[0, yTicks[yTicks.length - 1]]}
					ticks={yTicks}
					tickFormatter={formatValue}
					tick={TICK}
					tickLine={false}
					axisLine={false}
					width={40}
				/>
				<Tooltip
					isAnimationActive={false}
					cursor={{ fill: "var(--chart-grid-stroke)", stroke: "#666" }}
					content={({ active, payload }) =>
						active &&
						payload[0] && (
							<MonitoringTooltip
								row={payload[0].payload}
								series={series}
								formatValue={formatValue}
								unit={unit}
							/>
						)
					}
				/>
				{children}
			</ComposedChart>
		</ResponsiveContainer>
	);
};
