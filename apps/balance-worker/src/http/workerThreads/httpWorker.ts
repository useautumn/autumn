/**
 * An HTTP worker thread: one `Bun.serve` on the worker's port (SO_REUSEPORT spreads connections over the
 * threads), each request's bytes handed to the decide thread over the request ring, and answered with the
 * bytes that come back on the reply ring. Nothing here knows what a route means.
 */
import {
	createRingReader,
	createRingWriter,
} from "../../threads/ring/createRing.js";
import { createRingSignal } from "../../threads/ring/ringSignal.js";
import { FAIL_FRAME, readFailFrame } from "./frames/failFrame.js";
import {
	REPLY_FRAME,
	type ReplyFrame,
	readReplyFrame,
} from "./frames/replyFrame.js";
import {
	type RequestMeta,
	requestFrameMaxLength,
	writeRequestFrame,
} from "./frames/requestFrame.js";
import { createHeldReplies } from "./heldReplies/createHeldReplies.js";
import { recordLatency } from "./latency/latencyCells.js";
import { forwardableHeadersOf } from "./rules/forwardableHeadersOf.js";
import type {
	DecideThreadMessage,
	HttpWorkerInit,
	HttpWorkerMessage,
} from "./types/httpWorkerThread.js";

declare var self: Worker;

/** The writer's own answer at capacity, so a client backs off the same way either way. */
const REQUEST_RING_FULL = JSON.stringify({
	error: {
		code: "OVERLOADED",
		message: "Worker request queue is full; retry with backoff",
	},
});
const JSON_HEADERS = { "content-type": "application/json" };
const LARGE_REQUEST_BYTES = 256 * 1024;

type HttpWorkerThread = { receive(message: DecideThreadMessage): void };

/** A request waiting for its reply; `route` is its index in `init.latency.routes`, or -1 when untimed. */
type Pending = {
	resolve(response: Response): void;
	route: number;
	startedAt: number;
};

let thread: HttpWorkerThread | null | undefined;

self.onmessage = function receive(
	event: MessageEvent<HttpWorkerInit | DecideThreadMessage>,
) {
	const message = event.data;
	if ("kind" in message) thread?.receive(message);
	else thread ??= startThread(message);
};

function report(
	message: HttpWorkerMessage,
	transfer: ArrayBuffer[] = [],
): void {
	self.postMessage(message, transfer);
}

/** Null when the port could not be bound; the decide thread has been told why. */
function startThread(init: HttpWorkerInit): HttpWorkerThread | null {
	const requests = createRingWriter({
		ring: init.requestRing,
		signal: createRingSignal({ sab: init.requestSignal }),
	});
	const replies = createRingReader({ ring: init.replyRing });
	const replySignal = createRingSignal({ sab: init.replySignal });
	const pending = new Map<number, Pending>();
	const latencyCells = new Int32Array(init.latency.cells);
	let answeredAt = 0;
	const largeRequestBytes = Math.min(
		init.requestRing.capacity >>> 3,
		LARGE_REQUEST_BYTES,
	);
	const held = init.heldReplies ? createHeldReplies(init.heldReplies) : null;
	let nextReqId = 1;

	function answer({
		reqId,
		status,
		headers,
		body,
	}: {
		reqId: number;
		status: number;
		headers: [string, string][];
		body: Uint8Array | ArrayBuffer;
	}): void {
		const waiting = pending.get(reqId);
		if (!waiting) return;
		pending.delete(reqId);
		waiting.resolve(new Response(body, { status, headers }));
		if (waiting.route < 0) return;
		recordLatency({
			cells: latencyCells,
			route: waiting.route,
			micros: (answeredAt - waiting.startedAt) * 1_000,
		});
	}

	function answerOrHold(reply: ReplyFrame): void {
		if (reply.heldUntilSeq === 0 || !held) {
			answer(reply);
			return;
		}
		function answerHeld(): void {
			answer(reply);
		}
		function failHeld({ status, body }: { status: number; body: Uint8Array }) {
			answer({ reqId: reply.reqId, status, headers: reply.headers, body });
		}
		held.hold({
			partition: reply.partition,
			seq: reply.heldUntilSeq,
			answer: answerHeld,
			fail: failHeld,
		});
	}

	function drainReplies(): void {
		let read = 0;
		for (;;) {
			const frame = replies.next();
			if (!frame) break;
			if (frame.type === REPLY_FRAME)
				answerOrHold(readReplyFrame({ reader: replies, frame }));
			else if (frame.type === FAIL_FRAME && held)
				held.fail(readFailFrame({ reader: replies, frame }));
			else
				throw new Error(
					`HTTP worker ${init.index}: unexpected frame ${frame.type}`,
				);
			replies.advance();
			read++;
		}
		if (read > 0) replies.release();
	}

	function hasWork(): boolean {
		return replies.hasWork() || held?.releasable() === true;
	}

	async function replyLoop(): Promise<void> {
		for (;;) {
			// One clock read per pass answers every reply in it.
			answeredAt = performance.now();
			drainReplies();
			held?.release();
			// The timeout is insurance against a wake lost some other way; a publish or a commit wakes the thread first.
			await replySignal.sleep({ hasWork, timeoutMs: 50 });
		}
	}

	async function forward(request: Request): Promise<Response> {
		const startedAt = performance.now();
		const url = request.url;
		const pathStart = url.indexOf("/", url.indexOf("//") + 2);
		const meta: RequestMeta = {
			method: request.method,
			path: pathStart === -1 ? "/" : url.slice(pathStart),
			headers: forwardableHeadersOf({ headers: request.headers }),
		};
		const query = meta.path.indexOf("?");
		const route = init.latency.routes.indexOf(
			query === -1 ? meta.path : meta.path.slice(0, query),
		);
		const body = new Uint8Array(await request.arrayBuffer());
		const metaText = JSON.stringify(meta);
		const reqId = nextReqId;
		nextReqId = nextReqId === 0xfffffffe ? 1 : nextReqId + 1;
		const { promise, resolve } = Promise.withResolvers<Response>();
		const waiting = { resolve, route, startedAt };
		if (requestFrameMaxLength({ metaText, body }) > largeRequestBytes) {
			pending.set(reqId, waiting);
			report({ kind: "request", reqId, meta, body: body.buffer }, [
				body.buffer,
			]);
			return promise;
		}
		if (!writeRequestFrame({ writer: requests, reqId, metaText, body }))
			return new Response(REQUEST_RING_FULL, {
				status: 429,
				headers: JSON_HEADERS,
			});
		pending.set(reqId, waiting);
		requests.flush();
		return promise;
	}

	let server: ReturnType<typeof Bun.serve>;
	try {
		server = Bun.serve({
			hostname: init.hostname,
			port: init.port,
			reusePort: true,
			idleTimeout: 0,
			maxRequestBodySize: init.maxRequestBodySize,
			fetch: forward,
		});
	} catch (cause) {
		report({
			kind: "error",
			message: String((cause as Error)?.message ?? cause),
		});
		return null;
	}

	/** Graceful: requests already accepted are answered before the thread says it stopped. */
	async function stop(): Promise<void> {
		await server.stop();
		report({ kind: "stopped" });
	}

	function receive(message: DecideThreadMessage): void {
		answeredAt = performance.now();
		if (message.kind === "reply") answer(message);
		else void stop();
	}

	void replyLoop();
	report({ kind: "ready" });
	return { receive };
}
