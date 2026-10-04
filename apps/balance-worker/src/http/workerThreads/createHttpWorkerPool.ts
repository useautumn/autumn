/**
 * The decide thread's side of the HTTP worker threads: starts them, drains their request rings into the
 * worker's own `fetch` (the Hono app, unchanged), and writes each reply's bytes back to the thread that
 * holds the connection. The decide thread never accepts a socket.
 */
import type { AutumnLogger } from "@autumn/logging";
import {
	createRing,
	createRingReader,
	createRingWriter,
} from "../../threads/ring/createRing.js";
import { createRingSignal } from "../../threads/ring/ringSignal.js";
import { replyFrameMaxLength, writeReplyFrame } from "./frames/replyFrame.js";
import {
	REQUEST_FRAME,
	type RequestMeta,
	readRequestFrame,
} from "./frames/requestFrame.js";
import type { HttpWorkerLane, PendingReply } from "./types/httpWorkerLane.js";
import type {
	HttpWorkerPool,
	HttpWorkerPoolConfig,
} from "./types/httpWorkerPool.js";
import type {
	DecideThreadMessage,
	HttpWorkerInit,
	HttpWorkerMessage,
	LargeRequest,
} from "./types/httpWorkerThread.js";

type Fetch = (request: Request) => Response | Promise<Response>;

const MAX_FRAMES_PER_DRAIN = 512;

export function createHttpWorkerPool({
	ctx,
	config,
}: {
	ctx: {
		fetch: Fetch;
		logger: Pick<AutumnLogger, "error">;
		/** A thread died or the drain loop broke: the pool cannot serve again on its own, so the task is replaced. */
		onFatal(failure: { cause: unknown }): void;
	};
	config: HttpWorkerPoolConfig;
}): HttpWorkerPool {
	if (!Number.isSafeInteger(config.threads) || config.threads < 1)
		throw new RangeError("httpWorkers must be a positive integer");
	// A reply over an eighth of the ring could need more contiguous room than the ring can ever free.
	const largeReplyBytes = config.replyRingBytes >>> 3;
	const requestSignal = createRingSignal();
	const lanes: HttpWorkerLane[] = [];
	let stopping = false;
	let failed = false;
	let flushScheduled = false;

	// A crash raises both `error` and `close`; the first cause is the one worth reporting.
	function fatal({ cause }: { cause: unknown }): void {
		if (failed || stopping) return;
		failed = true;
		ctx.logger.error(
			{ error: cause },
			"HTTP worker pool failed; the task must be replaced",
		);
		ctx.onFatal({ cause });
	}

	function failWith(cause: unknown): void {
		fatal({ cause });
	}

	function flushDirtyLanes(): void {
		flushScheduled = false;
		for (const lane of lanes) {
			if (!lane.dirty) continue;
			lane.dirty = false;
			lane.replies.flush();
		}
	}

	function scheduleFlush(): void {
		if (flushScheduled) return;
		flushScheduled = true;
		setImmediate(flushDirtyLanes);
	}

	/** Writes queued replies in order; a full ring waits for the thread to read, then carries on. */
	async function pump(lane: HttpWorkerLane): Promise<void> {
		lane.pumping = true;
		try {
			while (lane.outbox.length > 0 && !stopping) {
				const reply = lane.outbox[0] as PendingReply;
				if (writeReplyFrame({ writer: lane.replies, ...reply })) {
					lane.outbox.shift();
					lane.dirty = true;
					scheduleFlush();
					continue;
				}
				flushDirtyLanes();
				await lane.replies.waitForRoom({
					maxLength: replyFrameMaxLength(reply),
				});
			}
		} finally {
			lane.pumping = false;
		}
	}

	function reply({
		lane,
		reqId,
		response,
		body,
	}: {
		lane: HttpWorkerLane;
		reqId: number;
		response: Response;
		body: Uint8Array;
	}): void {
		const headers: [string, string][] = [];
		response.headers.forEach((value, name) => {
			headers.push([name, value]);
		});
		const metaText = JSON.stringify({ headers });
		if (replyFrameMaxLength({ metaText, body }) > largeReplyBytes) {
			// Transferred, so the bytes must be a buffer of their own.
			const buffer = body.slice().buffer;
			const message: DecideThreadMessage = {
				kind: "reply",
				reqId,
				status: response.status,
				headers,
				body: buffer,
			};
			lane.thread.postMessage(message, [buffer]);
			return;
		}
		lane.outbox.push({ reqId, status: response.status, metaText, body });
		if (!lane.pumping) pump(lane).catch(failWith);
	}

	function requestOf({
		meta,
		body,
	}: {
		meta: RequestMeta;
		body: Uint8Array | ArrayBuffer;
	}): Request {
		const hasBody = meta.method !== "GET" && meta.method !== "HEAD";
		return new Request(`http://${config.hostname}:${config.port}${meta.path}`, {
			method: meta.method,
			headers: meta.headers,
			body: hasBody ? body : undefined,
		});
	}

	async function serve({
		lane,
		reqId,
		request,
	}: {
		lane: HttpWorkerLane;
		reqId: number;
		request: Request;
	}): Promise<void> {
		let response: Response;
		try {
			response = await ctx.fetch(request);
		} catch (cause) {
			ctx.logger.error(
				{ error: cause },
				"HTTP worker request failed on the decide thread",
			);
			response = new Response(null, { status: 500 });
		}
		const body = new Uint8Array(await response.arrayBuffer());
		try {
			reply({ lane, reqId, response, body });
		} catch (cause) {
			// Only a dead thread refuses a reply (postMessage on a terminated thread).
			fatal({ cause });
		}
	}

	function drainLane(lane: HttpWorkerLane): number {
		let read = 0;
		while (read < MAX_FRAMES_PER_DRAIN) {
			const frame = lane.requests.next();
			if (!frame) break;
			if (frame.type !== REQUEST_FRAME)
				throw new Error(`HTTP worker pool: unexpected frame ${frame.type}`);
			const { reqId, meta, body } = readRequestFrame({
				reader: lane.requests,
				frame,
			});
			lane.requests.advance();
			read++;
			void serve({ lane, reqId, request: requestOf({ meta, body }) });
		}
		if (read > 0) lane.requests.release();
		return read;
	}

	function hasRequests(): boolean {
		return lanes.some((lane) => lane.requests.hasWork());
	}

	async function drainLoop(): Promise<void> {
		while (!stopping) {
			let read = 0;
			for (const lane of lanes) read += drainLane(lane);
			if (read > 0) {
				// Let the dispatched requests run before the next batch, so a flood cannot starve replies.
				await new Promise<void>((resolve) => setImmediate(resolve));
				continue;
			}
			await requestSignal.sleep({ hasWork: hasRequests, timeoutMs: 20 });
		}
	}

	function onLargeRequest({
		lane,
		message,
	}: {
		lane: HttpWorkerLane;
		message: LargeRequest;
	}): void {
		void serve({ lane, reqId: message.reqId, request: requestOf(message) });
	}

	function spawn({ index }: { index: number }): {
		lane: HttpWorkerLane;
		ready: Promise<void>;
	} {
		const requestRing = createRing({ capacity: config.requestRingBytes });
		const replyRing = createRing({ capacity: config.replyRingBytes });
		const replySignal = createRingSignal();
		const thread = new Worker(
			new URL("./httpWorker.ts", import.meta.url).href,
			{
				name: `balance-worker-http-${index}`,
			},
		);
		const ready = Promise.withResolvers<void>();
		const stopped = Promise.withResolvers<void>();
		const lane: HttpWorkerLane = {
			index,
			thread,
			requests: createRingReader({ ring: requestRing }),
			replies: createRingWriter({ ring: replyRing, signal: replySignal }),
			outbox: [],
			pumping: false,
			dirty: false,
			stopped: stopped.promise,
		};
		let listening = false;
		function died(error: Error): void {
			stopped.resolve();
			if (!listening) ready.reject(error);
			else fatal({ cause: error });
		}
		thread.onmessage = function receive(
			event: MessageEvent<HttpWorkerMessage>,
		) {
			const message = event.data;
			if (message.kind === "ready") {
				listening = true;
				ready.resolve();
			} else if (message.kind === "error")
				ready.reject(
					new Error(
						`HTTP worker ${index} could not listen: ${message.message}`,
					),
				);
			else if (message.kind === "request") onLargeRequest({ lane, message });
			else stopped.resolve();
		};
		thread.onerror = function crashed(event) {
			died(new Error(`HTTP worker ${index} failed: ${event.message}`));
		};
		// A thread that exits on its own (uncaught error, process.exit) closes without being asked.
		thread.addEventListener("close", function closed(event) {
			if (stopping) {
				stopped.resolve();
				return;
			}
			died(
				new Error(
					`HTTP worker ${index} exited with code ${(event as CloseEvent).code}`,
				),
			);
		});
		const init: HttpWorkerInit = {
			index,
			hostname: config.hostname,
			port: config.port,
			maxRequestBodySize: config.maxRequestBodySize,
			requestRing,
			replyRing,
			requestSignal: requestSignal.sab,
			replySignal: replySignal.sab,
		};
		thread.postMessage(init);
		return { lane, ready: ready.promise };
	}

	/** Each thread closes its server and says so; a thread that already exited is not waited for. */
	async function stop(): Promise<void> {
		stopping = true;
		for (const lane of lanes) {
			try {
				lane.thread.postMessage({ kind: "stop" } satisfies DecideThreadMessage);
			} catch {
				// Already gone: its `close` has settled `stopped`.
			}
		}
		await Promise.all(lanes.map((lane) => lane.stopped));
		for (const lane of lanes) lane.thread.terminate();
	}

	async function listen(): Promise<{ stop(): Promise<void> }> {
		const spawned = Array.from({ length: config.threads }, (_, index) =>
			spawn({ index }),
		);
		for (const { lane } of spawned) lanes.push(lane);
		try {
			await Promise.all(spawned.map(({ ready }) => ready));
		} catch (cause) {
			stopping = true;
			for (const { lane } of spawned) lane.thread.terminate();
			throw cause;
		}
		// A frame the loop cannot read means a broken ring; nothing downstream could recover from that.
		drainLoop().catch(failWith);
		return { stop };
	}

	return { listen };
}
