import { expect, test } from "bun:test";
import { createKafkaLog } from "../../src/client/librdkafka/kafkaLog.js";
import { createLibrdkafkaProducer } from "../../src/client/librdkafka/producer/createLibrdkafkaProducer.js";
import { createProducerStatisticsReader } from "../../src/client/librdkafka/producer/producerStatistics.js";
import type {
	KafkaProducerStatistics,
	KafkaRequestTiming,
} from "../../src/client/types/kafkaClient.js";

type BrokerCounters = {
	tx: number;
	rx: number;
	timeouts?: number;
	outbuf?: number;
	waitresp?: number;
	rtt?: { cnt: number; p50: number; p99: number };
};

function brokerOf({
	nodeid,
	tx,
	rx,
	timeouts = 0,
	outbuf = 0,
	waitresp = 0,
	rtt = { cnt: 0, p50: 0, p99: 0 },
}: BrokerCounters & { nodeid: number }) {
	return {
		nodeid,
		tx,
		rx,
		req_timeouts: timeouts,
		outbuf_cnt: outbuf,
		waitresp_cnt: waitresp,
		rtt,
		outbuf_latency: { p99: 0 },
	};
}

function documentOf(
	brokers: Record<string, BrokerCounters & { nodeid: number }>,
) {
	const document: { brokers: Record<string, ReturnType<typeof brokerOf>> } = {
		brokers: {},
	};
	for (const [name, counters] of Object.entries(brokers))
		document.brokers[name] = brokerOf(counters);
	return document;
}

test("each window is the change since the previous read, and idle or bootstrap brokers are left out", () => {
	const reader = createProducerStatisticsReader();
	reader.read({
		document: documentOf({
			"b-1:9092/1": { nodeid: 1, tx: 100, rx: 100 },
			"b-2:9092/2": { nodeid: 2, tx: 7, rx: 7 },
		}),
	});
	const window = reader.read({
		document: documentOf({
			"bootstrap:9092/bootstrap": { nodeid: -1, tx: 3, rx: 3 },
			"b-1:9092/1": {
				nodeid: 1,
				tx: 160,
				rx: 158,
				waitresp: 2,
				rtt: { cnt: 58, p50: 3_200, p99: 8_600 },
			},
			"b-2:9092/2": { nodeid: 2, tx: 7, rx: 7 },
		}),
	});
	expect(window).toEqual({
		brokers: [
			{
				broker: "b-1:9092/1",
				nodeId: 1,
				requests: 60,
				responses: 58,
				timeouts: 0,
				rttP50Ms: 3.2,
				rttP99Ms: 8.6,
				outbufCount: 0,
				waitRespCount: 2,
				stalled: false,
			},
		],
	});
});

test("a broker that answers nothing while requests stay outstanding across a window is stalled", () => {
	const reader = createProducerStatisticsReader();
	reader.read({
		document: documentOf({
			"b-1:9092/1": { nodeid: 1, tx: 50, rx: 48, waitresp: 2 },
		}),
	});
	const [broker] = reader.read({
		document: documentOf({
			"b-1:9092/1": { nodeid: 1, tx: 55, rx: 48, waitresp: 5, outbuf: 4 },
		}),
	}).brokers;
	expect(broker).toMatchObject({
		requests: 5,
		responses: 0,
		rttP50Ms: null,
		rttP99Ms: null,
		outbufCount: 4,
		waitRespCount: 5,
		stalled: true,
	});
});

test("a request sent just before the read is outstanding but not a stall", () => {
	const reader = createProducerStatisticsReader();
	reader.read({
		document: documentOf({ "b-1:9092/1": { nodeid: 1, tx: 9, rx: 9 } }),
	});
	const [broker] = reader.read({
		document: documentOf({
			"b-1:9092/1": { nodeid: 1, tx: 10, rx: 9, waitresp: 1 },
		}),
	}).brokers;
	expect(broker).toMatchObject({
		requests: 1,
		waitRespCount: 1,
		stalled: false,
	});
});

test("requests that timed out unanswered are a stall even once nothing is outstanding", () => {
	const reader = createProducerStatisticsReader();
	reader.read({
		document: documentOf({
			"b-1:9092/1": { nodeid: 1, tx: 3, rx: 1, waitresp: 2 },
		}),
	});
	const [broker] = reader.read({
		document: documentOf({
			"b-1:9092/1": { nodeid: 1, tx: 3, rx: 1, timeouts: 2 },
		}),
	}).brokers;
	expect(broker).toMatchObject({
		timeouts: 2,
		waitRespCount: 0,
		stalled: true,
	});
});

test("the producer reports both its request timings and its statistics windows from one statistics callback", () => {
	let receiveStatistics: ((event: { message: string }) => void) | undefined;
	function producerOf(config: {
		stats_cb: (event: { message: string }) => void;
	}): object {
		receiveStatistics = config.stats_cb;
		return {};
	}
	const producer = createLibrdkafkaProducer({
		ctx: {
			kafka: { producer: producerOf } as never,
			nativeClientConfig: {},
			defaults: {
				requestTimeout: 1_000,
				retry: { retries: 1, initialRetryTime: 10, maxRetryTime: 10 },
			},
			log: createKafkaLog({
				clientId: "t",
				sink: { error() {}, warn() {}, info() {}, debug() {} },
			}),
		},
		config: { idempotent: true },
	});
	const timings: KafkaRequestTiming[] = [];
	const windows: KafkaProducerStatistics[] = [];
	producer.onRequestTimings((timing) => timings.push(timing));
	producer.onStatistics((statistics) => windows.push(statistics));
	receiveStatistics?.({
		message: JSON.stringify(
			documentOf({
				"b-1:9092/1": {
					nodeid: 1,
					tx: 4,
					rx: 2,
					waitresp: 2,
					rtt: { cnt: 2, p50: 1_000, p99: 2_000 },
				},
			}),
		),
	});
	receiveStatistics?.({
		message: JSON.stringify(
			documentOf({ "b-1:9092/1": { nodeid: 1, tx: 4, rx: 2, waitresp: 2 } }),
		),
	});
	receiveStatistics?.({ message: "not json" });
	expect(timings.map(({ durationMs }) => durationMs)).toEqual([2]);
	expect(windows.map(({ brokers }) => brokers[0]?.stalled)).toEqual([
		false,
		true,
	]);
});
