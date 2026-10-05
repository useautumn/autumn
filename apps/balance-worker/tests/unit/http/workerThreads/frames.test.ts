import { describe, expect, test } from "bun:test";
import {
	FAIL_FRAME,
	readFailFrame,
	writeFailFrame,
} from "../../../../src/http/workerThreads/frames/failFrame.js";
import {
	REPLY_FRAME,
	readReplyFrame,
	writeReplyFrame,
} from "../../../../src/http/workerThreads/frames/replyFrame.js";
import {
	REQUEST_FRAME,
	readRequestFrame,
	writeRequestFrame,
} from "../../../../src/http/workerThreads/frames/requestFrame.js";
import {
	createRing,
	createRingReader,
	createRingWriter,
} from "../../../../src/threads/ring/createRing.js";
import { createRingSignal } from "../../../../src/threads/ring/ringSignal.js";

const encoder = new TextEncoder();

function ringPair() {
	const ring = createRing({ capacity: 4096 });
	return {
		writer: createRingWriter({ ring, signal: createRingSignal() }),
		reader: createRingReader({ ring }),
	};
}

describe("HTTP worker frames", () => {
	test("a request frame carries its id, meta and body across, the body copied out of the ring", () => {
		const { writer, reader } = ringPair();
		const meta = {
			method: "POST",
			path: "/v1/track?debug=1",
			headers: [["content-type", "application/json"]] as [string, string][],
		};
		const body = encoder.encode('{"value":"é"}');
		expect(
			writeRequestFrame({
				writer,
				reqId: 7,
				metaText: JSON.stringify(meta),
				body,
			}),
		).toBe(true);
		writer.flush();

		const frame = reader.next();
		expect(frame?.type).toBe(REQUEST_FRAME);
		if (!frame) return;
		const request = readRequestFrame({ reader, frame });
		reader.advance();
		frame.bytes.fill(0);
		expect(request).toEqual({ reqId: 7, meta, body });
	});

	test("a reply frame carries its id, status, headers and body across", () => {
		const { writer, reader } = ringPair();
		const headers: [string, string][] = [["x-request-id", "req_1"]];
		const body = encoder.encode('{"ok":true}');
		writeReplyFrame({
			writer,
			reqId: 9,
			status: 409,
			metaText: JSON.stringify({ headers }),
			body,
		});
		writer.flush();

		const frame = reader.next();
		expect(frame?.type).toBe(REPLY_FRAME);
		if (!frame) return;
		expect(readReplyFrame({ reader, frame })).toEqual({
			reqId: 9,
			status: 409,
			partition: 0,
			heldUntilSeq: 0,
			headers,
			body,
		});
	});

	test("a held reply carries its partition and the sequence number it waits for; a fail frame its range", () => {
		const { writer, reader } = ringPair();
		const body = encoder.encode('{"ok":true}');
		writeReplyFrame({
			writer,
			reqId: 3,
			status: 200,
			partition: 7,
			heldUntilSeq: 2 ** 40 + 1,
			metaText: JSON.stringify({ headers: [] }),
			body,
		});
		writeFailFrame({
			writer,
			fail: {
				partition: 7,
				aboveSeq: 2 ** 40,
				lastSeq: 2 ** 40 + 5,
				status: 503,
				body: encoder.encode('{"error":{"code":"NOT_READY"}}'),
			},
		});
		writer.flush();
		const reply = reader.next();
		if (!reply) throw new Error("no reply frame");
		expect(readReplyFrame({ reader, frame: reply })).toMatchObject({
			reqId: 3,
			partition: 7,
			heldUntilSeq: 2 ** 40 + 1,
		});
		reader.advance();
		const fail = reader.next();
		if (!fail) throw new Error("no fail frame");
		expect(fail.type).toBe(FAIL_FRAME);
		const read = readFailFrame({ reader, frame: fail });
		expect({ ...read, body: new TextDecoder().decode(read.body) }).toEqual({
			partition: 7,
			aboveSeq: 2 ** 40,
			lastSeq: 2 ** 40 + 5,
			status: 503,
			body: '{"error":{"code":"NOT_READY"}}',
		});
	});

	test("a frame the ring has no room for is refused, not truncated", () => {
		const { writer } = ringPair();
		const body = new Uint8Array(1500);
		const write = () =>
			writeReplyFrame({ writer, reqId: 1, status: 200, metaText: "{}", body });
		expect(write()).toBe(true);
		expect(write()).toBe(true);
		expect(write()).toBe(false);
	});
});
