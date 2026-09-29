import { expect, test } from "bun:test";
import { createKafkaRequestTimings } from "../../../src/logging/kafkaRequestTimings.js";

test("summarises broker requests per API with percentiles and the slowest broker, then resets", () => {
	const timings = createKafkaRequestTimings({ maxSamplesPerApi: 1_000 });
	for (let i = 1; i <= 100; i++) {
		timings.record({
			apiName: "EndTxn",
			broker: i <= 90 ? "b-1:9098" : "b-2:9098",
			durationMs: i,
			pendingMs: 1,
		});
	}
	timings.record({
		apiName: "Produce",
		broker: "b-3:9098",
		durationMs: 7,
		pendingMs: 0,
	});

	const summary = timings.drain();
	const endTxn = summary.find(({ api }) => api === "EndTxn");
	expect(endTxn).toMatchObject({
		count: 100,
		p50: 50,
		p90: 90,
		p99: 99,
		max: 100,
		slowestBroker: { broker: "b-2:9098", p50: 95 },
	});
	expect(summary.find(({ api }) => api === "Produce")?.count).toBe(1);
	expect(timings.drain()).toEqual([]);
});

test("keeps memory bounded under a flood of requests", () => {
	const timings = createKafkaRequestTimings({ maxSamplesPerApi: 50 });
	for (let i = 0; i < 10_000; i++) {
		timings.record({
			apiName: "Produce",
			broker: "b-1",
			durationMs: i % 100,
			pendingMs: 0,
		});
	}
	const [produce] = timings.drain();
	expect(produce?.count).toBe(10_000);
	expect(produce?.sampled).toBe(50);
});
