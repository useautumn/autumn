import type { AtomMetricsRange, GetAtomMetricsResponse } from "@autumn/shared";
import { axiomStringFrom } from "@/external/axiom/utils/resultUtils.js";
import { queryAtomLogs } from "./queryAtomLogs.js";

const BUCKET_SECONDS: Record<AtomMetricsRange, number> = {
	"1h": 60,
	"24h": 30 * 60,
	"7d": 3 * 60 * 60,
};

const numberOrNull = (value: unknown) =>
	typeof value === "number" && Number.isFinite(value) ? value : null;

/** CPU, memory and traffic per bucket, from the health line every Atom logs every 10s with what changed since the last. */
export const queryAtomMetrics = async ({
	deploymentId,
	range,
}: {
	deploymentId: string;
	range: AtomMetricsRange;
}): Promise<GetAtomMetricsResponse> => {
	const bucketSeconds = BUCKET_SECONDS[range];
	const rows = await queryAtomLogs({
		deploymentId,
		startTime: `now-${range}`,
		pipeline: `
			| where body contains '"atom_health"'
			| extend data = parse_json(body).data
			| extend seconds = todouble(data.interval.seconds),
				cores = todouble(data.container.cpuLimitCores),
				memory = todouble(data.container.memoryBytes) / todouble(data.container.memoryLimitBytes)
			| summarize cpu = sum(todouble(data.interval.cpuSeconds)) / sum(seconds * cores),
				memory = avg(memory),
				requests = sum(todouble(data.interval.requests)),
				forwarded = sum(todouble(data.interval.forwarded)),
				pushes = sum(todouble(data.interval.pushes)),
				coveredSeconds = sum(seconds) / dcount(['attributes.horizon.replica_id'])
				by bin(_time, ${bucketSeconds}s)
			| sort by _time asc`,
	});
	// Axiom adds a totals row with no _time beside the buckets.
	const buckets = rows.filter((row) => row._time);
	return {
		bucket_seconds: bucketSeconds,
		points: buckets.map((row) => {
			// A bucket still filling, or one the Atom was down for part of, is rated over the time it reported.
			const seconds = numberOrNull(row.coveredSeconds) || bucketSeconds;
			const perSecond = (total: unknown) =>
				(numberOrNull(total) ?? 0) / seconds;
			return {
				at: Date.parse(axiomStringFrom(row._time)),
				cpu: numberOrNull(row.cpu),
				memory: numberOrNull(row.memory),
				requests_per_second: perSecond(row.requests),
				forwarded_per_second: perSecond(row.forwarded),
				pushes_per_second: perSecond(row.pushes),
			};
		}),
	};
};
