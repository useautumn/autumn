import { expect, test } from "bun:test";
import { requestTimingsOf } from "../../src/client/librdkafka/producer/createLibrdkafkaProducer.js";

/** A 10s window of a partition producer during a 1.5s broker stall: ~170 fast answers, ~30 held ones. */
const stalledWindow = JSON.stringify({
	brokers: {
		"bootstrap:9092/bootstrap": { nodeid: -1, rtt: { cnt: 0 } },
		"broker-1:9092/1": {
			nodeid: 1,
			rtt: { cnt: 200, avg: 44_000, p99: 1_480_000, max: 1_503_000 },
			outbuf_latency: { avg: 900, p99: 17_000 },
		},
		"broker-2:9092/2": {
			nodeid: 2,
			rtt: { cnt: 180, avg: 4_000, p99: 9_000, max: 11_000 },
			outbuf_latency: { avg: 100, p99: 800 },
		},
		"broker-3:9092/3": { nodeid: 3, rtt: { cnt: 0, avg: 0, p99: 0 } },
	},
});

test("a broker stall shows in the window's request timing, not averaged away", () => {
	expect(requestTimingsOf({ statistics: stalledWindow })).toEqual([
		{
			apiName: "Produce",
			broker: "broker-1:9092/1",
			durationMs: 1_480,
			pendingMs: 17,
		},
		{
			apiName: "Produce",
			broker: "broker-2:9092/2",
			durationMs: 9,
			pendingMs: 0.8,
		},
	]);
});
