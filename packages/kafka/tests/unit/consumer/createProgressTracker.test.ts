import { expect, test } from "bun:test";
import { createProgressTracker } from "../../../src/consumer/createProgressTracker.js";

const topic = "metering-events-v1";
const partition = 2;

async function waitsForTargetPosition(): Promise<void> {
	const tracker = createProgressTracker();
	let caughtUp = false;
	async function catchUpToTarget(): Promise<void> {
		await tracker.waitUntil({ topic, partition, nextOffset: 5n });
		caughtUp = true;
	}
	const catchUp = catchUpToTarget();

	tracker.advance({ topic, partition, nextOffset: 3n });
	await Promise.resolve();
	expect(caughtUp).toBe(false);

	tracker.advance({ topic, partition, nextOffset: 5n });
	await catchUp;

	expect(caughtUp).toBe(true);
	expect(tracker.read({ topic, partition })).toBe(5n);
}

function neverMovesConsumedPositionBackwards(): void {
	const tracker = createProgressTracker();

	tracker.advance({ topic, partition, nextOffset: 8n });
	tracker.advance({ topic, partition, nextOffset: 3n });

	expect(tracker.read({ topic, partition })).toBe(8n);
}

function tracksPositionAndHighWatermark(): void {
	const tracker = createProgressTracker();

	tracker.advance({ topic, partition, nextOffset: 8n });
	tracker.observeHighWatermark({ topic, partition, highWatermark: 12n });

	expect(tracker.readProgress({ topic, partition })).toEqual({
		consumedNextOffset: 8n,
		highWatermark: 12n,
	});
}

function neverMovesHighWatermarkBackwards(): void {
	const tracker = createProgressTracker();

	tracker.observeHighWatermark({ topic, partition, highWatermark: 12n });
	tracker.observeHighWatermark({ topic, partition, highWatermark: 9n });

	expect(tracker.readProgress({ topic, partition }).highWatermark).toBe(12n);
}

async function cancelsPendingWait(): Promise<void> {
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
}

test(
	"resolves catch-up only after the consumed position reaches the target",
	waitsForTargetPosition,
);
test(
	"never moves a consumed position backwards",
	neverMovesConsumedPositionBackwards,
);
test(
	"tracks consumed position and the latest observed high watermark",
	tracksPositionAndHighWatermark,
);
test(
	"never moves an observed high watermark backwards",
	neverMovesHighWatermarkBackwards,
);
test("cancels a pending catch-up wait", cancelsPendingWait);
