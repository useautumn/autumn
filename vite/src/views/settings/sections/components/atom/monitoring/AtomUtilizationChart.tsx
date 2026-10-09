import type { ByocCacheMachine } from "@autumn/shared";
import { Line, ReferenceDot } from "recharts";
import { atomMachineSpecs } from "../atomMachineDisplay";
import type {
	AtomMetricsChartData,
	AtomMetricsSeries,
} from "./atomMetricsChartData";
import { formatPercent } from "./atomMetricsFormat";
import { MonitoringChartCard } from "./MonitoringChartCard";
import { MonitoringLegend } from "./MonitoringLegend";
import { MonitoringPlot } from "./MonitoringPlot";

const SERIES: AtomMetricsSeries[] = [
	{ key: "cpu", label: "CPU", color: "var(--chart-series-1)" },
	{ key: "memory", label: "Memory", color: "var(--chart-series-7)" },
];

const PERCENT_TICKS = [0, 0.25, 0.5, 0.75, 1];

/** CPU and memory as shares of the machine's limits, each ending on a dot at its latest reading. */
export const AtomUtilizationChart = ({
	machine,
	chartData,
	isLoading,
}: {
	machine: ByocCacheMachine | null;
	chartData: AtomMetricsChartData | null;
	isLoading: boolean;
}) => {
	const latest = chartData?.latest;
	return (
		<MonitoringChartCard
			title="Utilization"
			description={[
				"CPU and memory",
				machine && `% of ${atomMachineSpecs(machine)}`,
			]
				.filter(Boolean)
				.join(", ")}
			readingAt={latest?.at}
			summary={
				<MonitoringLegend
					series={SERIES}
					latest={latest}
					formatValue={formatPercent}
				/>
			}
			isLoading={isLoading}
			isEmpty={!chartData}
		>
			{chartData && (
				<MonitoringPlot
					chartData={chartData}
					series={SERIES}
					yTicks={PERCENT_TICKS}
					formatValue={formatPercent}
				>
					{SERIES.map(({ key, color }) => (
						<Line
							key={key}
							dataKey={key}
							type="monotone"
							stroke={color}
							strokeWidth={1.5}
							dot={false}
							activeDot={{ r: 3, strokeWidth: 0 }}
							isAnimationActive={false}
						/>
					))}
					{SERIES.map(({ key, color }) => {
						const value = chartData.latest[key];
						return (
							value !== null && (
								<ReferenceDot
									key={key}
									x={chartData.latest.x}
									y={value}
									r={2.5}
									fill={color}
									stroke="none"
								/>
							)
						);
					})}
				</MonitoringPlot>
			)}
		</MonitoringChartCard>
	);
};
