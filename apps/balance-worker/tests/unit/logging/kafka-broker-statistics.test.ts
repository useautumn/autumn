import { expect, test } from "bun:test";
import type { KafkaBrokerStatistics } from "@autumn/kafka";
import {
	createKafkaBrokerStatistics,
	kafkaBrokersMessageOf,
} from "../../../src/logging/kafkaBrokerStatistics.js";

function windowOf(
	overrides: Partial<KafkaBrokerStatistics> & { nodeId: number },
): KafkaBrokerStatistics {
	return {
		broker: `b-${overrides.nodeId}:9092/${overrides.nodeId}`,
		requests: 10,
		responses: 10,
		timeouts: 0,
		rttP50Ms: 3,
		rttP99Ms: 5,
		outbufCount: 0,
		waitRespCount: 0,
		stalled: false,
		...overrides,
	};
}

test("summarises each broker across the worker's producers, then resets", () => {
	const statistics = createKafkaBrokerStatistics();
	statistics.record({
		producer: "log/1",
		statistics: {
			brokers: [
				windowOf({ nodeId: 2, rttP99Ms: 9, waitRespCount: 1 }),
				windowOf({ nodeId: 1 }),
			],
		},
	});
	statistics.record({
		producer: "log/2",
		statistics: {
			brokers: [windowOf({ nodeId: 2, rttP50Ms: 4, waitRespCount: 2 })],
		},
	});

	expect(statistics.drain()).toEqual([
		{
			id: 1,
			producers: 1,
			requests: 10,
			responses: 10,
			timeouts: 0,
			rttP50Ms: 3,
			rttP99Ms: 5,
			outbuf: 0,
			waitResp: 0,
			stalled: false,
		},
		{
			id: 2,
			producers: 2,
			requests: 20,
			responses: 20,
			timeouts: 0,
			rttP50Ms: 4,
			rttP99Ms: 9,
			outbuf: 0,
			waitResp: 3,
			stalled: false,
		},
	]);
	expect(statistics.drain()).toEqual([]);
});

test("two windows of one producer add their counters and keep the later gauges", () => {
	const statistics = createKafkaBrokerStatistics();
	statistics.record({
		producer: "log/1",
		statistics: {
			brokers: [windowOf({ nodeId: 1, rttP99Ms: 40, waitRespCount: 5 })],
		},
	});
	statistics.record({
		producer: "log/1",
		statistics: {
			brokers: [windowOf({ nodeId: 1, rttP99Ms: 6, waitRespCount: 1 })],
		},
	});
	expect(statistics.drain()).toMatchObject([
		{ id: 1, producers: 1, requests: 20, rttP99Ms: 40, waitResp: 1 },
	]);
});

test("a stalled broker names the producers stuck on it and leads the message", () => {
	const statistics = createKafkaBrokerStatistics();
	const stalled = windowOf({
		nodeId: 34,
		responses: 0,
		rttP50Ms: null,
		rttP99Ms: null,
		waitRespCount: 5,
		stalled: true,
	});
	statistics.record({
		producer: "log/7",
		statistics: { brokers: [stalled, windowOf({ nodeId: 1 })] },
	});
	statistics.record({ producer: "log/3", statistics: { brokers: [stalled] } });
	const brokers = statistics.drain();

	expect(brokers[1]).toMatchObject({
		id: 34,
		responses: 0,
		rttP99Ms: null,
		waitResp: 10,
		stalled: true,
		stalledProducers: ["log/3", "log/7"],
	});
	expect(kafkaBrokersMessageOf({ brokers })).toBe(
		"Kafka brokers stalled: 34 answered nothing with requests outstanding",
	);
});

test("without a stall the message names the slowest broker", () => {
	const statistics = createKafkaBrokerStatistics();
	statistics.record({
		producer: "log/1",
		statistics: {
			brokers: [
				windowOf({ nodeId: 1, rttP99Ms: 4.2 }),
				windowOf({ nodeId: 2, rttP99Ms: 87.5 }),
			],
		},
	});
	expect(kafkaBrokersMessageOf({ brokers: statistics.drain() })).toBe(
		"Kafka brokers: 2 active, worst p99 87.5ms on 2",
	);
});
