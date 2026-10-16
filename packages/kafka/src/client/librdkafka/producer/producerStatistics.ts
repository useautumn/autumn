import type {
	KafkaBrokerStatistics,
	KafkaProducerStatistics,
} from "../../types/kafkaWire.js";

/** The parts of a librdkafka statistics document this client reads; latencies are in microseconds. */
export type LibrdkafkaStatistics = {
	brokers?: Record<
		string,
		{
			nodeid?: number;
			tx?: number;
			rx?: number;
			req_timeouts?: number;
			outbuf_cnt?: number;
			waitresp_cnt?: number;
			rtt?: { cnt?: number; p50?: number; p99?: number };
			outbuf_latency?: { p99?: number };
		}
	>;
};

type BrokerCounters = {
	tx: number;
	rx: number;
	timeouts: number;
	outstanding: number;
};

const NO_COUNTERS: BrokerCounters = {
	tx: 0,
	rx: 0,
	timeouts: 0,
	outstanding: 0,
};

/**
 * Reads one producer's statistics documents in order. librdkafka's request counters are cumulative, so each
 * window is the change since the previous document; a request outstanding at both reads with no response
 * between them has waited at least a whole window, which is a stall even when the broker answers nothing.
 */
export function createProducerStatisticsReader(): {
	read(input: { document: LibrdkafkaStatistics }): KafkaProducerStatistics;
} {
	const previous = new Map<string, BrokerCounters>();

	function read({
		document,
	}: {
		document: LibrdkafkaStatistics;
	}): KafkaProducerStatistics {
		const brokers: KafkaBrokerStatistics[] = [];
		for (const [name, broker] of Object.entries(document.brokers ?? {})) {
			const nodeId = broker.nodeid ?? -1;
			if (nodeId < 0) continue;
			const outbufCount = broker.outbuf_cnt ?? 0;
			const waitRespCount = broker.waitresp_cnt ?? 0;
			const counters: BrokerCounters = {
				tx: broker.tx ?? 0,
				rx: broker.rx ?? 0,
				timeouts: broker.req_timeouts ?? 0,
				outstanding: outbufCount + waitRespCount,
			};
			const before = previous.get(name);
			previous.set(name, counters);
			const since = before ?? NO_COUNTERS;
			const requests = Math.max(0, counters.tx - since.tx);
			const responses = Math.max(0, counters.rx - since.rx);
			const timeouts = Math.max(0, counters.timeouts - since.timeouts);
			const idle =
				requests === 0 &&
				responses === 0 &&
				timeouts === 0 &&
				counters.outstanding === 0;
			if (idle) continue;
			const answered = (broker.rtt?.cnt ?? 0) > 0;
			brokers.push({
				broker: name,
				nodeId,
				requests,
				responses,
				timeouts,
				rttP50Ms: answered ? (broker.rtt?.p50 ?? 0) / 1000 : null,
				rttP99Ms: answered ? (broker.rtt?.p99 ?? 0) / 1000 : null,
				outbufCount,
				waitRespCount,
				stalled:
					(before?.outstanding ?? 0) > 0 &&
					responses === 0 &&
					(counters.outstanding > 0 || timeouts > 0),
			});
		}
		return { brokers };
	}

	return { read };
}
