/**
 * The consuming end of the ring stress test: reads frames on its own thread as the I/O worker reads results,
 * checks each one's sequence number and bytes, and reports how many it read or the first frame that was wrong.
 */
import {
	Doorbell,
	RingConsumer,
	type RingLayout,
} from "../../../src/serialDecide/ring.js";

declare var self: Worker;

export type RingReaderInit = {
	layout: RingLayout;
	bell: SharedArrayBuffer;
	count: number;
};

export type RingReaderResult =
	| { ok: true; read: number }
	| { ok: false; read: number; problem: string };

self.onmessage = async (event: MessageEvent<RingReaderInit>) => {
	const { layout, bell, count } = event.data;
	const consumer = new RingConsumer(layout);
	const doorbell = new Doorbell(bell);
	let read = 0;
	while (read < count) {
		const frame = consumer.next();
		if (!frame) {
			consumer.release();
			await doorbell.sleep({ hasWork: () => consumer.hasWork(), timeoutMs: 5 });
			continue;
		}
		const problem = problemOf({ frame, expected: read });
		if (problem) {
			self.postMessage({ ok: false, read, problem } satisfies RingReaderResult);
			return;
		}
		consumer.advance();
		read++;
	}
	consumer.release();
	self.postMessage({ ok: true, read } satisfies RingReaderResult);
};

function problemOf({
	frame,
	expected,
}: {
	frame: { type: number; bytes: Uint8Array; length: number };
	expected: number;
}): string | null {
	if (frame.type !== 1 + (expected % 5))
		return `frame ${expected}: type ${frame.type}`;
	if (frame.length < 4) return `frame ${expected}: length ${frame.length}`;
	const view = new DataView(frame.bytes.buffer, frame.bytes.byteOffset, 4);
	const index = view.getUint32(0, true);
	if (index !== expected) return `frame ${expected}: carries index ${index}`;
	for (let at = 4; at < frame.length; at++)
		if (frame.bytes[at] !== ((index + at) & 0xff))
			return `frame ${expected}: byte ${at} is ${frame.bytes[at]}`;
	return null;
}
