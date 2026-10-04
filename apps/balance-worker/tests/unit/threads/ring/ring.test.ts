/**
 * The SAB ring's framing over long runs. Positions are 32-bit in the shared header, so a ring that has carried
 * 4 GiB must keep producer and consumer agreeing on where frames start and end, wraps and padding included.
 */
import { describe, expect, test } from "bun:test";
import {
	createRing,
	createRingReader,
	createRingWriter,
} from "../../../../src/threads/ring/createRing.js";
import { createRingSignal } from "../../../../src/threads/ring/ringSignal.js";
import type {
	RingReader,
	RingWriter,
} from "../../../../src/threads/ring/types/ring.js";
import type { RingReaderInit, RingReaderResult } from "./ringReaderWorker.js";

const CAPACITY = 1 << 20;
const MAX_FRAME = CAPACITY >>> 3;
const POSITION_WRAP = 2 ** 32;

/** Moves both positions to `until` bytes short of 2^32 with empty frames, as ~4 GiB of replies would. */
function carryBytes({
	producer,
	consumer,
	until,
}: {
	producer: RingWriter;
	consumer: RingReader;
	until: number;
}): void {
	let carried = 0;
	const target = POSITION_WRAP - until;
	while (carried < target) {
		const length = Math.min(MAX_FRAME, target - carried - 5);
		if (length < 0) break;
		if (producer.claim({ type: 9, maxLength: length }) < 0)
			throw new Error("ring full while carrying");
		producer.publish({ length });
		producer.flush();
		const frame = consumer.next();
		if (!frame) throw new Error("ring empty while carrying");
		consumer.advance();
		consumer.release();
		carried += 5 + length;
	}
}

/** Deterministic sizes from tiny to an eighth of the ring, so frames land on every offset and wrap often. */
function sizes({ count, seed }: { count: number; seed: number }): number[] {
	let state = seed;
	return Array.from({ length: count }, () => {
		state = (state * 1_103_515_245 + 12_345) >>> 0;
		return Math.max(4, state % MAX_FRAME);
	});
}

/** `[u32 index][bytes (index + at) & 0xff]`: each frame says which it is and carries checkable bytes. */
function frameOf({ index, size }: { index: number; size: number }): Uint8Array {
	const bytes = new Uint8Array(size);
	for (let at = 4; at < size; at++) bytes[at] = (index + at) & 0xff;
	new DataView(bytes.buffer).setUint32(0, index, true);
	return bytes;
}

describe("SAB ring framing", () => {
	test("frames written across the 2^32 position wrap read back exactly, and nothing past them", () => {
		const ring = createRing({ capacity: CAPACITY });
		const producer = createRingWriter({ ring, signal: createRingSignal() });
		const consumer = createRingReader({ ring });
		carryBytes({ producer, consumer, until: 3 * CAPACITY + 17 });

		const planned = sizes({ count: 2_000, seed: 7 });
		let written = 0;
		let read = 0;
		while (read < planned.length) {
			// Fill what fits, publish, then drain part of it, so the two sides chase each other around the ring.
			while (written < planned.length) {
				const payload = frameOf({
					index: written,
					size: planned[written] as number,
				});
				if (!producer.write({ type: 1 + (written % 5), payload })) break;
				written++;
			}
			producer.flush();
			let drained = 0;
			for (;;) {
				const frame = consumer.next();
				if (!frame) break;
				expect(read).toBeLessThan(written);
				expect(frame.type).toBe(1 + (read % 5));
				expect(frame.bytes).toEqual(
					frameOf({ index: read, size: planned[read] as number }),
				);
				consumer.advance();
				read++;
				if (++drained === 7) break;
			}
			consumer.release();
		}
		expect(consumer.next()).toBeNull();
	});

	test.each([
		["on a fresh ring", 0],
		["across the 2^32 position wrap", 64 << 20],
	])(
		"a producer and a consumer on two threads agree on every frame %s",
		async (_name, until) => {
			const ring = createRing({ capacity: CAPACITY });
			const signal = createRingSignal();
			const producer = createRingWriter({ ring, signal });
			if (until > 0)
				carryBytes({ producer, consumer: createRingReader({ ring }), until });
			const planned = sizes({ count: 30_000, seed: 11 });
			const reader = new Worker(
				new URL("./ringReaderWorker.ts", import.meta.url).href,
			);
			const result = new Promise<RingReaderResult>((resolve) => {
				reader.onmessage = (event: MessageEvent<RingReaderResult>) =>
					resolve(event.data);
			});
			reader.postMessage({
				ring,
				signal: signal.sab,
				count: planned.length,
			} satisfies RingReaderInit);
			try {
				for (const [index, size] of planned.entries()) {
					const payload = frameOf({ index, size });
					while (!producer.write({ type: 1 + (index % 5), payload })) {
						producer.flush();
						await new Promise((resolve) => setImmediate(resolve));
					}
					if (index % 16 === 0) producer.flush();
				}
				producer.flush();
				expect(await result).toEqual({ ok: true, read: planned.length });
			} finally {
				reader.terminate();
			}
		},
		60_000,
	);
});
