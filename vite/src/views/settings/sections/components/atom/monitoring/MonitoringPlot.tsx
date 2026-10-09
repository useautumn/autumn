import { ATOM_METRICS_STATISTICS } from "@autumn/shared";
import { Fragment } from "react";
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
	AtomMetricsValues,
} from "./atomMetricsChartData";
import { formatMetricsWindow, STATISTIC_LABELS } from "./atomMetricsFormat";

const TICK = { fontSize: 11, fill: "#666" } as const;

type FormatValue = (value: number | null) => string;

/** The hovered period's time window and each series' value in it, or under each statistic. */
const MonitoringTooltip = ({
	row,
	series,
	formatValue,
	unit,
	showStatistics,
}: {
	row: AtomMetricsRow;
	series: AtomMetricsSeries[];
	formatValue: FormatValue;
	unit?: string;
	showStatistics?: boolean;
}) => {
	const columns: { label?: string; values: AtomMetricsValues }[] =
		showStatistics
			? ATOM_METRICS_STATISTICS.map((statistic) => ({
					label: STATISTIC_LABELS[statistic].column,
					values: row.statistics[statistic],
				}))
			: [{ values: row }];
	return (
		<div className="grid min-w-44 gap-1.5 rounded-lg bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10">
			<div className="flex items-center justify-between gap-3">
				<span className="font-medium">{formatMetricsWindow(row)}</span>
				{unit && <span className="text-subtle">{unit}</span>}
			</div>
			<div
				className="grid items-center gap-x-3 gap-y-1.5"
				style={{ gridTemplateColumns: `1fr repeat(${columns.length}, auto)` }}
			>
				{showStatistics && (
					<>
						<span />
						{columns.map(({ label }) => (
							<span key={label} className="text-right text-subtle">
								{label}
							</span>
						))}
					</>
				)}
				{series.map(({ key, label, color }) => (
					<Fragment key={key}>
						<span className="flex items-center gap-2 text-tertiary-foreground">
							<span
								className="size-2.5 shrink-0 rounded-sm"
								style={{ background: color }}
							/>
							{label}
						</span>
						{columns.map(({ label: column, values }) => (
							<span
								key={column ?? key}
								className="text-right tabular-nums text-muted-foreground"
							>
								{formatValue(values[key])}
							</span>
						))}
					</Fragment>
				))}
			</div>
		</div>
	);
};

/** The time axis, value axis, grid and hover both monitoring charts share; the series are its children. */
export const MonitoringPlot = ({
	chartData,
	series,
	yTicks,
	formatValue,
	unit,
	showStatistics,
	children,
}: {
	chartData: AtomMetricsChartData;
	series: AtomMetricsSeries[];
	yTicks: number[];
	formatValue: FormatValue;
	/** Shown beside the hovered window, for values the formatter leaves bare. */
	unit?: string;
	/** Hover shows each statistic's value, for series the statistic applies to. */
	showStatistics?: boolean;
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
								showStatistics={showStatistics}
							/>
						)
					}
				/>
				{children}
			</ComposedChart>
		</ResponsiveContainer>
	);
};
