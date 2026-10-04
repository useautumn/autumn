import { describe, expect, test } from "bun:test";
import { listenWithWorkers } from "../../../src/serialDecide/listenWithWorkers.js";

function stoppable() {
	const stops: string[] = [];
	return {
		stops,
		pool: { stop: async () => void stops.push("pool") },
		kafkaWorker: { stop: async () => void stops.push("kafka") },
	};
}

describe("listening with the I/O pool and the Kafka worker", () => {
	test("a Kafka worker that fails to start stops the pool before the failure propagates", async () => {
		const { stops, pool } = stoppable();
		let caught: unknown;
		try {
			await listenWithWorkers({
				ctx: {
					listenPool: async () => pool,
					startKafkaWorker: async () => {
						throw new Error("could not build the Kafka client");
					},
				},
			});
		} catch (cause) {
			caught = cause;
		}
		expect((caught as Error).message).toBe("could not build the Kafka client");
		expect(stops).toEqual(["pool"]);
	});

	test("stop() ends the pool first and the Kafka worker after it, even when the pool's stop fails", async () => {
		const { stops, kafkaWorker } = stoppable();
		const listener = await listenWithWorkers({
			ctx: {
				listenPool: async () => ({
					stop: async () => {
						stops.push("pool");
						throw new Error("pool stop failed");
					},
				}),
				startKafkaWorker: async () => kafkaWorker,
			},
		});
		expect(listener.kafkaWorker).toBe(kafkaWorker);
		let caught: unknown;
		try {
			await listener.stop();
		} catch (cause) {
			caught = cause;
		}
		expect((caught as Error).message).toBe("pool stop failed");
		expect(stops).toEqual(["pool", "kafka"]);
	});

	test("without a Kafka worker the listener is the pool alone", async () => {
		const { stops, pool } = stoppable();
		const listener = await listenWithWorkers({
			ctx: { listenPool: async () => pool },
		});
		expect(listener.kafkaWorker).toBeNull();
		await listener.stop();
		expect(stops).toEqual(["pool"]);
	});
});
