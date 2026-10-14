import type {
	AtomMetricsPoint,
	AtomMetricsRange,
	AtomMetricsRates,
	GetAtomMetricsResponse,
} from "@autumn/shared";
import {
	axiomNumberFrom,
	axiomStringFrom,
} from "@/external/axiom/utils/resultUtils.js";
import { queryAtomLogs } from "./queryAtomLogs.js";

const RANGE_SECONDS: Record<AtomMetricsRange, number> = {
	"1h": 60 * 60,
	"24h": 24 * 60 * 60,
	"7d": 7 * 24 * 60 * 60,
};

const PERIOD_STEPS_SECONDS = [
	10,
	30,
	60,
	2 * 60,
	5 * 60,
	10 * 60,
	15 * 60,
	30 * 60,
	60 * 60,
	2 * 60 * 60,
];
const MAX_POINTS = 120;

export const atomMetricsPeriodSeconds = ({
	range,
	createdAt,
	now,
}: {
	range: AtomMetricsRange;
	createdAt: number;
	now: number;
}) => {
	const spanSeconds = Math.min(RANGE_SECONDS[range], (now - createdAt) / 1000);
	return (
		PERIOD_STEPS_SECONDS.find((period) => spanSeconds / period <= MAX_POINTS) ??
		PERIOD_STEPS_SECONDS[PERIOD_STEPS_SECONDS.length - 1]
	);
};

const WINDOWS_PIPELINE = `
	| where line contains '"atom_health"'
	| extend data = parse_json(line).data
	| where todouble(data.interval.seconds) > 0
	| extend lineSeconds = todouble(data.interval.seconds)
	| summarize requests = sum(todouble(data.interval.requests)),
		forwarded = sum(todouble(data.interval.forwarded)),
		pushes = sum(todouble(data.interval.pushes)),
		seconds = sum(lineSeconds) / dcount(['attributes.horizon.replica_id']),
		cpuSeconds = sum(todouble(data.interval.cpuSeconds)),
		coreSeconds = sum(lineSeconds * todouble(data.container.cpuLimitCores)),
		memoryBytes = sum(todouble(data.container.memoryBytes)),
		memoryLimitBytes = sum(todouble(data.container.memoryLimitBytes))
		by bin(_time, 10s)
	| extend requestsPerSecond = requests / seconds,
		forwardedPerSecond = forwarded / seconds,
		pushesPerSecond = pushes / seconds`;

const periodsPipeline = ({ periodSeconds }: { periodSeconds: number }) => `
	${WINDOWS_PIPELINE}
	| summarize cpu = sum(cpuSeconds) / sum(coreSeconds),
		memory = sum(memoryBytes) / sum(memoryLimitBytes),
		requests = sum(requests),
		forwarded = sum(forwarded),
		pushes = sum(pushes),
		seconds = sum(seconds),
		arg_max(requestsPerSecond, forwardedPerSecond, pushesPerSecond)
		by bin(_time, ${periodSeconds}s)
	| sort by _time asc`;

const LATEST_PIPELINE = `
	${WINDOWS_PIPELINE}
	| summarize _time = max(_time),
		requests = sum(requests),
		forwarded = sum(forwarded),
		pushes = sum(pushes),
		seconds = sum(seconds)`;

type AxiomRow = Record<string, unknown>;

const numberOrNull = (value: unknown) =>
	typeof value === "number" && Number.isFinite(value) ? value : null;

const windowRatesOf = (row: AxiomRow): AtomMetricsRates => ({
	requests: axiomNumberFrom(row.requestsPerSecond),
	forwarded: axiomNumberFrom(row.forwardedPerSecond),
	pushes: axiomNumberFrom(row.pushesPerSecond),
});

const totalRatesOf = (row: AxiomRow): AtomMetricsRates => {
	const seconds = axiomNumberFrom(row.seconds);
	return {
		requests: axiomNumberFrom(row.requests) / seconds,
		forwarded: axiomNumberFrom(row.forwarded) / seconds,
		pushes: axiomNumberFrom(row.pushes) / seconds,
	};
};

const periodToPoint = (row: AxiomRow): AtomMetricsPoint => ({
	at: Date.parse(axiomStringFrom(row._time)),
	cpu: numberOrNull(row.cpu),
	memory: numberOrNull(row.memory),
	maximum: windowRatesOf(row),
	average: totalRatesOf(row),
});

/** Axiom adds a totals row with no _time beside the windows. */
const isTimedRow = (row: AxiomRow) => Boolean(row._time);

export const queryAtomMetrics = async ({
	deploymentId,
	range,
	createdAt,
}: {
	deploymentId: string;
	range: AtomMetricsRange;
	createdAt: number;
}): Promise<GetAtomMetricsResponse> => {
	const periodSeconds = atomMetricsPeriodSeconds({
		range,
		createdAt,
		now: Date.now(),
	});
	const [periods, latestRows] = await Promise.all([
		queryAtomLogs({
			deploymentId,
			startTime: `now-${range}`,
			pipeline: periodsPipeline({ periodSeconds }),
		}),
		queryAtomLogs({
			deploymentId,
			startTime: "now-1m",
			pipeline: LATEST_PIPELINE,
		}),
	]);
	const latest = latestRows.find(isTimedRow);
	return {
		period_seconds: periodSeconds,
		points: periods.filter(isTimedRow).map(periodToPoint),
		latest: latest
			? {
					at: Date.parse(axiomStringFrom(latest._time)),
					...totalRatesOf(latest),
				}
			: null,
	};
};
