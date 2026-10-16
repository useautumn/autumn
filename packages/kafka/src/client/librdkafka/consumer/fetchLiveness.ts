import type { ConsumerRunnerState } from "./types/runnerState.js";

type BrokerStatistics = {
	nodeid?: number;
	/** Microseconds since the last receive on the socket, -1 before the first. */
	rxidle?: number;
	/** Requests sent per request type, since the client started. */
	req?: Record<string, number>;
};

type PartitionStatistics = {
	partition?: number;
	leader?: number;
	fetch_state?: string;
};

type ConsumerStatistics = {
	brokers?: Record<string, BrokerStatistics>;
	topics?: Record<string, { partitions?: Record<string, PartitionStatistics> }>;
};

export type FetchLiveness = {
	/** True when every assigned, unpaused partition's leader answered a fetch since the previous statistics. */
	answeredSince(params: {
		state: ConsumerRunnerState;
		statistics: string;
	}): boolean;
};

/**
 * librdkafka keeps one fetch in flight per broker, so a broker whose fetch count moved between two statistics
 * windows answered one; with a recent receive, that rules out a fetch that only timed out.
 */
export function createFetchLiveness({
	intervalMs,
}: {
	intervalMs: number;
}): FetchLiveness {
	const fetchesByBroker = new Map<number, number>();
	const maxIdleMicros = (intervalMs + 1_000) * 1_000;

	function brokersAnswering({
		statistics,
	}: {
		statistics: ConsumerStatistics;
	}): Set<number> {
		const answering = new Set<number>();
		for (const broker of Object.values(statistics.brokers ?? {})) {
			const nodeId = broker.nodeid ?? -1;
			if (nodeId < 0) continue;
			const fetches = broker.req?.Fetch ?? 0;
			const previous = fetchesByBroker.get(nodeId);
			fetchesByBroker.set(nodeId, fetches);
			const idle = broker.rxidle ?? -1;
			if (
				previous !== undefined &&
				fetches > previous &&
				idle >= 0 &&
				idle <= maxIdleMicros
			)
				answering.add(nodeId);
		}
		return answering;
	}

	function answeredSince({
		state,
		statistics,
	}: {
		state: ConsumerRunnerState;
		statistics: string;
	}): boolean {
		const parsed = JSON.parse(statistics) as ConsumerStatistics;
		const answering = brokersAnswering({ statistics: parsed });
		let fetching = 0;
		for (const [key, { topic, partition }] of state.assigned) {
			if (state.paused.has(key)) continue;
			const stats =
				parsed.topics?.[topic]?.partitions?.[String(partition)] ?? null;
			if (!stats || stats.fetch_state !== "active") return false;
			if (!answering.has(stats.leader ?? -1)) return false;
			fetching += 1;
		}
		return fetching > 0;
	}

	return { answeredSince };
}
