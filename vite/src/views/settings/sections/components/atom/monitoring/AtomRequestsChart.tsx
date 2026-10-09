import { Bar } from "recharts";
import type {
	AtomMetricsChartData,
	AtomMetricsRow,
	AtomMetricsSeries,
} from "./atomMetricsChartData";
import { formatPercent, formatRate, rateAxisTicks } from "./atomMetricsFormat";
import { MonitoringChartCard } from "./MonitoringChartCard";
import { MonitoringLegend } from "./MonitoringLegend";
import { MonitoringPlot } from "./MonitoringPlot";

const ANSWERED: AtomMetricsSeries = {
	key: "answered",
	label: "Answered by Atom",
	color: "var(--chart-series-3)",
};

const FORWARDED: AtomMetricsSeries = {
	key: "forwarded",
	label: "Forwarded to Autumn",
	color: "var(--chart-series-other)",
};

/** Shown beside the checks for context, but kept out of the bars and the % answered. */
const PUSHES: AtomMetricsSeries = {
	key: "pushes",
	label: "Subject pushes",
	color: "var(--chart-series-4)",
};

const SERIES = [ANSWERED, FORWARDED, PUSHES];

const requestsOf = (row: AtomMetricsRow) =>
	(row.answered ?? 0) + (row.forwarded ?? 0);

/** The latest req/s, and how much of it Atom answered without Autumn. */
const RequestsSummary = ({
	latest,
}: {
	latest: AtomMetricsRow | undefined;
}) => {
	const requests = latest ? requestsOf(latest) : null;
	const answeredShare =
		latest && requests ? (latest.answered ?? 0) / requests : null;
	return (
		<div className="flex flex-wrap items-end justify-between gap-3">
			<div className="flex flex-col gap-0.5">
				<span className="flex items-baseline gap-1.5">
					<span className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
						{formatRate(requests)}
					</span>
					<span className="text-sm text-tertiary-foreground">req/s</span>
				</span>
				{answeredShare !== null && (
					<span className="text-sm text-tertiary-foreground">
						<span style={{ color: ANSWERED.color }}>
							{formatPercent(answeredShare)}
						</span>{" "}
						answered by Atom, no round trip to Autumn
					</span>
				)}
			</div>
			<MonitoringLegend
				series={SERIES}
				latest={latest}
				formatValue={formatRate}
			/>
		</div>
	);
};

/** Requests per second, stacked into those Atom answered and those it forwarded to Autumn. */
export const AtomRequestsChart = ({
	chartData,
	isLoading,
}: {
	chartData: AtomMetricsChartData | null;
	isLoading: boolean;
}) => (
	<MonitoringChartCard
		title="Requests per second"
		description="Checks your app sends to this Atom"
		summary={<RequestsSummary latest={chartData?.latest} />}
		isLoading={isLoading}
		isEmpty={!chartData}
	>
		{chartData && (
			<MonitoringPlot
				chartData={chartData}
				series={SERIES}
				yTicks={rateAxisTicks({
					max: Math.max(...chartData.rows.map(requestsOf)),
				})}
				formatValue={formatRate}
				unit="req/s"
			>
				<Bar
					dataKey={ANSWERED.key}
					stackId="requests"
					fill={ANSWERED.color}
					isAnimationActive={false}
				/>
				<Bar
					dataKey={FORWARDED.key}
					stackId="requests"
					fill={FORWARDED.color}
					radius={[2, 2, 0, 0]}
					isAnimationActive={false}
				/>
			</MonitoringPlot>
		)}
	</MonitoringChartCard>
);
