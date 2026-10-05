import { describe, expect, test } from "bun:test";
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
			headers,
			body,
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
