import { describe, expect, test } from "bun:test";
import { createProgressTracker } from "@autumn/kafka";

const topic = "metering-events-v1";
const partition = 2;

describe("Kafka partition position tracker", () => {
	test("resolves catch-up only after the consumed position reaches the target", async () => {
		const tracker = createProgressTracker();
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
		const tracker = createProgressTracker();

		tracker.advance({ topic, partition, nextOffset: 8n });
		tracker.advance({ topic, partition, nextOffset: 3n });

		expect(tracker.read({ topic, partition })).toBe(8n);
	});

	test("tracks consumed position and the latest observed high watermark", () => {
		const tracker = new KafkaPartitionPositionTracker();

		tracker.advance({ topic, partition, nextOffset: 8n });
		tracker.observeHighWatermark({ topic, partition, highWatermark: 12n });

		expect(tracker.readProgress({ topic, partition })).toEqual({
			consumedNextOffset: 8n,
			highWatermark: 12n,
		});
	});

	test("never moves an observed high watermark backwards", () => {
		const tracker = new KafkaPartitionPositionTracker();

		tracker.observeHighWatermark({ topic, partition, highWatermark: 12n });
		tracker.observeHighWatermark({ topic, partition, highWatermark: 9n });

		expect(tracker.readProgress({ topic, partition }).highWatermark).toBe(12n);
	});

	test("cancels a pending catch-up wait", async () => {
		const tracker = createProgressTracker();
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
