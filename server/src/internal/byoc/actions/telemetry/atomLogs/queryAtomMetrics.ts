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

const PERIOD_SECONDS: Record<AtomMetricsRange, number> = {
	"1h": 10,
	"24h": 5 * 60,
	"7d": 60 * 60,
};

/** Every replica's health line summed into the 10s window it landed in, the raw resolution. */
const WINDOWS_PIPELINE = `
	| where body contains '"atom_health"'
	| extend data = parse_json(body).data
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

/** Each period's totals for its average, and its busiest window, split as that window was, for its maximum. */
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

type AxiomRow = Record<string, unknown>;

const numberOrNull = (value: unknown) =>
	typeof value === "number" && Number.isFinite(value) ? value : null;

const windowRatesOf = (row: AxiomRow): AtomMetricsRates => ({
	requests: axiomNumberFrom(row.requestsPerSecond),
	forwarded: axiomNumberFrom(row.forwardedPerSecond),
	pushes: axiomNumberFrom(row.pushesPerSecond),
});

const periodToPoint = (row: AxiomRow): AtomMetricsPoint => {
	// Rated over the seconds the replicas reported, so a period still filling isn't understated.
	const seconds = axiomNumberFrom(row.seconds);
	return {
		at: Date.parse(axiomStringFrom(row._time)),
		cpu: numberOrNull(row.cpu),
		memory: numberOrNull(row.memory),
		maximum: windowRatesOf(row),
		average: {
			requests: axiomNumberFrom(row.requests) / seconds,
			forwarded: axiomNumberFrom(row.forwarded) / seconds,
			pushes: axiomNumberFrom(row.pushes) / seconds,
		},
	};
};

/** Axiom adds a totals row with no _time beside the windows. */
const isTimedRow = (row: AxiomRow) => Boolean(row._time);

/** CPU, memory and traffic per period, plus the latest 10s window, from the health line every Atom logs every 10s with what changed since the last. */
export const queryAtomMetrics = async ({
	deploymentId,
	range,
}: {
	deploymentId: string;
	range: AtomMetricsRange;
}): Promise<GetAtomMetricsResponse> => {
	const periodSeconds = PERIOD_SECONDS[range];
	const [periods, latestWindows] = await Promise.all([
		queryAtomLogs({
			deploymentId,
			startTime: `now-${range}`,
			pipeline: periodsPipeline({ periodSeconds }),
		}),
		queryAtomLogs({
			deploymentId,
			startTime: "now-1m",
			pipeline: `${WINDOWS_PIPELINE} | top 1 by _time desc`,
		}),
	]);
	const latestWindow = latestWindows.find(isTimedRow);
	return {
		period_seconds: periodSeconds,
		points: periods.filter(isTimedRow).map(periodToPoint),
		latest: latestWindow
			? {
					at: Date.parse(axiomStringFrom(latestWindow._time)),
					...windowRatesOf(latestWindow),
				}
			: null,
	};
};
