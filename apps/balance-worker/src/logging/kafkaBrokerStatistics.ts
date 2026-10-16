import type {
	KafkaBrokerStatistics,
	KafkaProducerStatistics,
} from "@autumn/kafka";

/** One broker over one report interval, across every producer on this worker. */
export type KafkaBrokerSummary = {
	id: number;
	/** Producers with traffic to it, or requests outstanding to it. */
	producers: number;
	requests: number;
	responses: number;
	timeouts: number;
	/** The worst producer's window percentile; null when no request returned. */
	rttP50Ms: number | null;
	rttP99Ms: number | null;
	outbuf: number;
	waitResp: number;
	stalled: boolean;
	/** The producers that saw it stall, as topic/partition. */
	stalledProducers?: string[];
};

type BrokerWindow = Omit<KafkaBrokerStatistics, "broker" | "nodeId">;

function maxOf(a: number | null, b: number | null): number | null {
	if (a === null) return b;
	if (b === null) return a;
	return Math.max(a, b);
}

/** Two windows of one producer inside one interval: counters add up, gauges are the later window's. */
function followedBy({
	earlier,
	later,
}: {
	earlier: BrokerWindow;
	later: BrokerWindow;
}): BrokerWindow {
	return {
		requests: earlier.requests + later.requests,
		responses: earlier.responses + later.responses,
		timeouts: earlier.timeouts + later.timeouts,
		rttP50Ms: maxOf(earlier.rttP50Ms, later.rttP50Ms),
		rttP99Ms: maxOf(earlier.rttP99Ms, later.rttP99Ms),
		outbufCount: later.outbufCount,
		waitRespCount: later.waitRespCount,
		stalled: earlier.stalled || later.stalled,
	};
}

function summaryOf({
	id,
	byProducer,
}: {
	id: number;
	byProducer: Map<string, BrokerWindow>;
}): KafkaBrokerSummary {
	const summary: KafkaBrokerSummary = {
		id,
		producers: byProducer.size,
		requests: 0,
		responses: 0,
		timeouts: 0,
		rttP50Ms: null,
		rttP99Ms: null,
		outbuf: 0,
		waitResp: 0,
		stalled: false,
	};
	const stalledProducers: string[] = [];
	for (const [producer, window] of byProducer) {
		summary.requests += window.requests;
		summary.responses += window.responses;
		summary.timeouts += window.timeouts;
		summary.rttP50Ms = maxOf(summary.rttP50Ms, window.rttP50Ms);
		summary.rttP99Ms = maxOf(summary.rttP99Ms, window.rttP99Ms);
		summary.outbuf += window.outbufCount;
		summary.waitResp += window.waitRespCount;
		if (window.stalled) stalledProducers.push(producer);
	}
	if (stalledProducers.length === 0) return summary;
	return {
		...summary,
		stalled: true,
		stalledProducers: stalledProducers.sort(),
	};
}

/** Every producer's per-broker statistics windows on this worker, summarised per broker and reset by the read. */
export function createKafkaBrokerStatistics() {
	let windows = new Map<number, Map<string, BrokerWindow>>();

	function record({
		producer,
		statistics,
	}: {
		producer: string;
		statistics: KafkaProducerStatistics;
	}): void {
		for (const { broker: _name, nodeId, ...window } of statistics.brokers) {
			const byProducer = windows.get(nodeId) ?? new Map<string, BrokerWindow>();
			windows.set(nodeId, byProducer);
			const earlier = byProducer.get(producer);
			byProducer.set(
				producer,
				earlier ? followedBy({ earlier, later: window }) : window,
			);
		}
	}

	function drain(): KafkaBrokerSummary[] {
		const drained = windows;
		windows = new Map();
		return [...drained]
			.sort(([a], [b]) => a - b)
			.map(([id, byProducer]) => summaryOf({ id, byProducer }));
	}

	return { record, drain };
}

/** The process's broker statistics: every partition producer on this worker reports into one. */
export const kafkaBrokerStatistics = createKafkaBrokerStatistics();

export function kafkaBrokersMessageOf({
	brokers,
}: {
	brokers: KafkaBrokerSummary[];
}): string {
	const stalled = brokers.filter((broker) => broker.stalled);
	if (stalled.length > 0)
		return `Kafka brokers stalled: ${stalled.map((broker) => broker.id).join(", ")} answered nothing with requests outstanding`;
	let worst: KafkaBrokerSummary | undefined;
	for (const broker of brokers)
		if ((broker.rttP99Ms ?? -1) > (worst?.rttP99Ms ?? -1)) worst = broker;
	if (!worst) return `Kafka brokers: ${brokers.length} active, no responses`;
	return `Kafka brokers: ${brokers.length} active, worst p99 ${worst.rttP99Ms}ms on ${worst.id}`;
}
