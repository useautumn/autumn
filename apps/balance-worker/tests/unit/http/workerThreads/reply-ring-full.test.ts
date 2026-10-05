import { expect, test } from "bun:test";
import { readReplyFrame } from "../../../../src/http/workerThreads/frames/replyFrame.js";
import { replyToLane } from "../../../../src/http/workerThreads/pool/sendReplies.js";
import type { HttpWorkerLane } from "../../../../src/http/workerThreads/types/httpWorkerLane.js";
import type { HttpWorkerPoolScope } from "../../../../src/http/workerThreads/types/httpWorkerPoolScope.js";
import {
	createRing,
	createRingReader,
	createRingWriter,
} from "../../../../src/threads/ring/createRing.js";
import { createRingSignal } from "../../../../src/threads/ring/ringSignal.js";

const REPLY_RING_BYTES = 4096;

/** The decide thread's end of one lane, with the thread's reader in the test's hands. */
function laneWithStalledReader() {
	const ring = createRing({ capacity: REPLY_RING_BYTES });
	const signal = createRingSignal();
	const lane = {
		index: 0,
		replies: createRingWriter({ ring, signal }),
		outbox: [],
		pumping: false,
		dirty: false,
	} as unknown as HttpWorkerLane;
	const scope = {
		ctx: { logger: { error() {} }, onFatal() {} },
		config: { replyRingBytes: REPLY_RING_BYTES },
		state: {
			lanes: [lane],
			stopping: false,
			flushScheduled: false,
			heldOnDecideThread: [],
			health: { ringFullWaits: 0, heldReplies: 0, failRanges: 0 },
		},
	} as unknown as HttpWorkerPoolScope;
	return { scope, lane, reader: createRingReader({ ring }) };
}

test("a reply that finds its thread's ring full waits, is counted, and arrives once the reader resumes", async () => {
	const { scope, lane, reader } = laneWithStalledReader();
	const body = new Uint8Array(400);
	const sent = 20;
	for (let reqId = 1; reqId <= sent; reqId++)
		replyToLane({ scope, lane, reqId, status: 200, headers: [], body });
	await Bun.sleep(20);
	expect(scope.state.health.ringFullWaits).toBeGreaterThan(0);
	expect(lane.outbox.length).toBeGreaterThan(0);

	const received: number[] = [];
	for (let turn = 0; turn < 50 && received.length < sent; turn++) {
		for (let frame = reader.next(); frame; frame = reader.next()) {
			received.push(readReplyFrame({ reader, frame }).reqId);
			reader.advance();
		}
		reader.release();
		await Bun.sleep(5);
	}
	expect(received).toEqual(Array.from({ length: sent }, (_, i) => i + 1));
	expect(lane.outbox).toEqual([]);
});
