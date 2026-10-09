import { Bar } from "recharts";
import type {
	AtomMetricsChartData,
	AtomMetricsReading,
	AtomMetricsSeries,
	AtomMetricsValues,
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

const requestsOf = (
	values: Pick<AtomMetricsValues, "answered" | "forwarded">,
) => (values.answered ?? 0) + (values.forwarded ?? 0);

/** The req/s in the latest 10s, and how much of it Atom answered without Autumn. */
const RequestsSummary = ({ now }: { now: AtomMetricsReading | null }) => {
	const requests = now ? requestsOf(now) : null;
	const answeredShare = now && requests ? (now.answered ?? 0) / requests : null;
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
			<MonitoringLegend series={SERIES} latest={now} formatValue={formatRate} />
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
		readingAt={chartData?.now?.at}
		summary={<RequestsSummary now={chartData?.now ?? null} />}
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
				showStatistics
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
