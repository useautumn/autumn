import { Skeleton } from "@autumn/ui";
import { Area } from "recharts";
import {
	type AtomMetricsChartData,
	type AtomMetricsSeries,
	requestsOf,
} from "./atomMetricsChartData";
import { formatPercent, formatRate, rateAxisTicks } from "./atomMetricsFormat";
import { atomRequestsHeadline } from "./atomRequestsHeadline";
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

const PUSHES: AtomMetricsSeries = {
	key: "pushes",
	label: "Subject pushes",
	color: "var(--chart-series-4)",
};

const SERIES = [ANSWERED, FORWARDED, PUSHES];

const RequestsSummary = ({
	chartData,
	isLoading,
}: {
	chartData: AtomMetricsChartData | null;
	isLoading: boolean;
}) => {
	const headline = atomRequestsHeadline(chartData);
	return (
		<div className="flex flex-wrap items-end justify-between gap-3">
			<div className="flex flex-col gap-0.5">
				<span className="flex h-8 items-baseline gap-1.5">
					{isLoading ? (
						<Skeleton className="h-7 w-24 self-center" />
					) : headline.kind === "idle" ? (
						<span className="text-2xl font-semibold tracking-tight text-tertiary-foreground">
							No traffic
						</span>
					) : (
						<>
							<span className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
								{formatRate(
									headline.kind === "rate" ? headline.requests : null,
								)}
							</span>
							<span className="text-sm text-tertiary-foreground">req/s</span>
						</>
					)}
				</span>
				<span className="flex h-5 items-center text-sm text-tertiary-foreground">
					{isLoading && <Skeleton className="h-4 w-64" />}
					{headline.kind === "rate" && (
						<span>
							<span style={{ color: ANSWERED.color }}>
								{formatPercent(headline.answeredShare)}
							</span>{" "}
							answered by Atom, no round trip to Autumn
						</span>
					)}
					{headline.kind === "idle" && `in the last ${headline.idleFor}`}
				</span>
			</div>
			<MonitoringLegend
				series={SERIES}
				latest={chartData?.now}
				formatValue={formatRate}
			/>
		</div>
	);
};

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
		summary={<RequestsSummary chartData={chartData} isLoading={isLoading} />}
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
				{[ANSWERED, FORWARDED].map(({ key, color }) => (
					<Area
						key={key}
						dataKey={key}
						stackId="requests"
						type="monotone"
						stroke={color}
						strokeWidth={1.5}
						fill={color}
						fillOpacity={0.2}
						dot={false}
						activeDot={{ r: 3, strokeWidth: 0 }}
						isAnimationActive={false}
					/>
				))}
			</MonitoringPlot>
		)}
	</MonitoringChartCard>
);
