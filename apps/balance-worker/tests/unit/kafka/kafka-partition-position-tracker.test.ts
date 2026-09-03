import { describe, expect, test } from "bun:test";
import { KafkaPartitionPositionTracker } from "../../../src/kafka/kafkaPartitionPositionTracker.js";

const topic = "metering-events-v1";
const partition = 2;

describe("Kafka partition position tracker", () => {
	test("resolves catch-up only after the consumed position reaches the target", async () => {
		const tracker = new KafkaPartitionPositionTracker();
		let caughtUp = false;
		const catchUp = tracker
			.waitUntil({ topic, partition, nextOffset: 5n })
			.then(() => {
				caughtUp = true;
			});

		tracker.advance({ topic, partition, nextOffset: 3n });
		await Promise.resolve();
		expect(caughtUp).toBe(false);

		tracker.advance({ topic, partition, nextOffset: 5n });
		await catchUp;

		expect(caughtUp).toBe(true);
		expect(tracker.read({ topic, partition })).toBe(5n);
	});

	test("never moves a consumed position backwards", () => {
		const tracker = new KafkaPartitionPositionTracker();

		tracker.advance({ topic, partition, nextOffset: 8n });
		tracker.advance({ topic, partition, nextOffset: 3n });

		expect(tracker.read({ topic, partition })).toBe(8n);
	});

	test("cancels a pending catch-up wait", async () => {
		const tracker = new KafkaPartitionPositionTracker();
		const controller = new AbortController();
		const stopped = new Error("partition stopped");
		const catchUp = tracker.waitUntil({
			topic,
			partition,
			nextOffset: 5n,
			signal: controller.signal,
		});

		controller.abort(stopped);

		await expect(catchUp).rejects.toBe(stopped);
		expect(tracker.read({ topic, partition })).toBeNull();
	});
});
