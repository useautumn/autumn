/**
 * The main thread's side of the I/O worker pool: spawns the workers, drains their command rings into
 * the worker's own `fetch` (the thin fast path and the Hono app, unchanged), and writes each
 * Response's bytes back to the worker that owns the connection. The main thread never accepts a socket.
 */
import type { AutumnLogger } from "@autumn/logging";
import type { HotDecider } from "./hotProtocol.js";
import {
	FRAME,
	type IoWorkerInit,
	type IoWorkerMessage,
	type MainMessage,
	type OversizedRequest,
	REQ_HEADER_BYTES,
	RES_HEADER_BYTES,
	type RequestMeta,
	type ResponseMeta,
} from "./ioProtocol.js";
import type { PositionBoard } from "./positionBoard.js";
import { allocateRing, Doorbell, RingConsumer, RingProducer } from "./ring.js";

export type IoWorkerPoolConfig = {
	hostname: string;
	port: number;
	maxRequestBodySize: number;
	workers: number;
	/** Per worker; both must be powers of two. Defaults: 4 MiB of commands, 16 MiB of results. */
	commandRingBytes?: number;
	resultRingBytes?: number;
};

export type IoWorkerPool = {
	/** Resolves once every worker is bound to the port. */
	listen(): Promise<{ stop(): Promise<void>; port: number }>;
	readStats(): Record<string, Record<string, number>>;
};

type Fetch = (request: Request) => Response | Promise<Response>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MAX_FRAMES_PER_DRAIN = 512;

type Lane = {
	index: number;
	worker: Worker;
	commands: RingConsumer;
	results: RingProducer;
	dirty: boolean;
	stats: Record<string, number>;
};

export function createIoWorkerPool({
	ctx,
	config,
}: {
	ctx: {
		fetch: Fetch;
		logger: Pick<AutumnLogger, "info" | "warn" | "error">;
		/** A worker thread died or the dispatch loop broke: the pool cannot serve on its own again, so the task must be replaced. */
		onFatal(failure: { cause: unknown }): void;
		/** Serial-decide arm D: hot tracks are decided here and their replies held on the I/O thread by commit position. */
		hot?: { decider: HotDecider; positions: PositionBoard };
	};
	config: IoWorkerPoolConfig;
}): IoWorkerPool {
	if (!Number.isSafeInteger(config.workers) || config.workers < 1)
		throw new RangeError("ioWorkers must be a positive integer");
	const commandRingBytes = config.commandRingBytes ?? 4 << 20;
	const resultRingBytes = config.resultRingBytes ?? 16 << 20;
	const commandBell = new Doorbell();
	const lanes: Lane[] = [];
	const stats = {
		drains: 0,
		requests: 0,
		oversized: 0,
		resultRingWaits: 0,
		sleeps: 0,
	};
	let stopping = false;
	let failed = false;
	let deferredFlush = false;

	// A crash raises both `error` and `close`; the first cause is the one worth reporting.
	function fatal({ cause }: { cause: unknown }): void {
		if (failed || stopping) return;
		failed = true;
		ctx.logger.error(
			{ error: cause },
			"I/O worker pool failed; the task must be replaced",
		);
		ctx.onFatal({ cause });
	}

	function flushDirty(): void {
		deferredFlush = false;
		for (const lane of lanes) {
			if (!lane.dirty) continue;
			lane.dirty = false;
			lane.results.flush();
		}
	}

	function scheduleFlush(): void {
		if (deferredFlush) return;
		deferredFlush = true;
		setImmediate(flushDirty);
	}

	function writeResult({
		lane,
		reqId,
		status,
		meta,
		body,
	}: {
		lane: Lane;
		reqId: number;
		status: number;
		meta: string;
		body: Uint8Array;
	}): boolean {
		const maxLength = RES_HEADER_BYTES + meta.length * 3 + body.length;
		if (maxLength > lane.results.maxFrameBytes) return false;
		const at = lane.results.claim({ type: FRAME.RES, maxLength });
		if (at < 0) return false;
		const view = lane.results.payloadView;
		view.setUint32(at, reqId, true);
		view.setUint16(at + 4, status, true);
		const { written } = encoder.encodeInto(
			meta,
			lane.results.payload.subarray(
				at + RES_HEADER_BYTES,
				at + maxLength - body.length,
			),
		);
		view.setUint32(at + 6, written, true);
		lane.results.payload.set(body, at + RES_HEADER_BYTES + written);
		lane.results.publish({ length: RES_HEADER_BYTES + written + body.length });
		lane.dirty = true;
		scheduleFlush();
		return true;
	}

	async function answer({
		lane,
		reqId,
		response,
	}: {
		lane: Lane;
		reqId: number;
		response: Response;
	}): Promise<void> {
		const body = new Uint8Array(await response.arrayBuffer());
		const headers: [string, string][] = [];
		response.headers.forEach((value, name) => {
			headers.push([name, value]);
		});
		const meta = JSON.stringify({ h: headers } satisfies ResponseMeta);
		// A full result ring means the worker is behind on reads; it drains continuously, so wait a turn.
		for (let attempt = 0; ; attempt++) {
			if (writeResult({ lane, reqId, status: response.status, meta, body }))
				return;
			if (
				RES_HEADER_BYTES + meta.length * 3 + body.length >
				lane.results.maxFrameBytes
			) {
				lane.worker.postMessage(
					{
						kind: "response",
						reqId,
						status: response.status,
						meta: { h: headers },
						body: body.buffer,
					} satisfies MainMessage,
					[body.buffer],
				);
				return;
			}
			stats.resultRingWaits++;
			flushDirty();
			await Bun.sleep(attempt < 10 ? 1 : 5);
		}
	}

	function requestOf({
		meta,
		body,
	}: {
		meta: RequestMeta;
		body: Uint8Array | ArrayBuffer;
	}): Request {
		const hasBody = meta.m !== "GET" && meta.m !== "HEAD";
		return new Request(`http://${config.hostname}:${config.port}${meta.u}`, {
			method: meta.m,
			headers: meta.h,
			body: hasBody ? body : undefined,
		});
	}

	async function serve({
		lane,
		reqId,
		request,
	}: {
		lane: Lane;
		reqId: number;
		request: Request;
	}): Promise<void> {
		let response: Response;
		try {
			response = await ctx.fetch(request);
		} catch (cause) {
			ctx.logger.error(
				{ error: cause },
				"I/O worker request failed on the main thread",
			);
			response = new Response(null, { status: 500 });
		}
		try {
			await answer({ lane, reqId, response });
		} catch (cause) {
			// Only a dead worker refuses a reply (postMessage on a terminated thread).
			fatal({ cause });
		}
	}

	function drainLane(lane: Lane): number {
		let n = 0;
		while (n < MAX_FRAMES_PER_DRAIN) {
			const frame = lane.commands.next();
			if (!frame) break;
			if (frame.type !== FRAME.REQ)
				throw new Error(`I/O pool: unexpected frame ${frame.type}`);
			const view = lane.commands.payloadView;
			const reqId = view.getUint32(frame.offset, true);
			const metaLength = view.getUint32(frame.offset + 4, true);
			const meta = JSON.parse(
				decoder.decode(
					frame.bytes.subarray(REQ_HEADER_BYTES, REQ_HEADER_BYTES + metaLength),
				),
			) as RequestMeta;
			// `Request` keeps the body bytes, so they are copied out of the ring before the slot is released.
			const body = frame.bytes.slice(REQ_HEADER_BYTES + metaLength);
			lane.commands.advance();
			n++;
			void serve({ lane, reqId, request: requestOf({ meta, body }) });
		}
		if (n > 0) lane.commands.release();
		return n;
	}

	async function drainLoop(): Promise<void> {
		while (!stopping) {
			let did = 0;
			for (const lane of lanes) did += drainLane(lane);
			if (did > 0) {
				stats.drains++;
				stats.requests += did;
				// Let the dispatched requests run before taking the next batch, so a flood cannot starve replies.
				await new Promise<void>((resolve) => setImmediate(resolve));
				continue;
			}
			stats.sleeps++;
			await commandBell.sleep({
				hasWork: () => lanes.some((lane) => lane.commands.hasWork()),
				timeoutMs: 20,
			});
		}
	}

	function onOversized({
		lane,
		message,
	}: {
		lane: Lane;
		message: OversizedRequest;
	}): void {
		stats.oversized++;
		void serve({
			lane,
			reqId: message.reqId,
			request: requestOf({ meta: message.meta, body: message.body }),
		});
	}

	function spawn({ index }: { index: number }): {
		lane: Lane;
		ready: Promise<void>;
	} {
		const commandRing = allocateRing({ capacity: commandRingBytes });
		const resultRing = allocateRing({ capacity: resultRingBytes });
		const resultBell = new Doorbell();
		const worker = new Worker(new URL("./ioWorker.ts", import.meta.url).href, {
			name: `balance-worker-io-${index}`,
		});
		const lane: Lane = {
			index,
			worker,
			commands: new RingConsumer(commandRing),
			results: new RingProducer(resultRing, resultBell),
			dirty: false,
			stats: {},
		};
		const ready = Promise.withResolvers<void>();
		let listening = false;
		worker.onmessage = (event: MessageEvent<IoWorkerMessage>) => {
			const message = event.data;
			switch (message.kind) {
				case "ready":
					listening = true;
					ready.resolve();
					return;
				case "error":
					ready.reject(
						new Error(
							`I/O worker ${index} could not listen: ${message.message}`,
						),
					);
					return;
				case "stats":
					lane.stats = message.stats;
					return;
				case "request":
					onOversized({ lane, message });
					return;
				case "stopped":
					return;
			}
		};
		function died(error: Error): void {
			if (!listening) ready.reject(error);
			else fatal({ cause: error });
		}
		worker.onerror = (event) => {
			died(new Error(`I/O worker ${index} failed: ${event.message}`));
		};
		// A worker that exits on its own (uncaught error, process.exit) closes without being asked.
		worker.addEventListener("close", (event) => {
			if (stopping) return;
			const { code } = event as CloseEvent;
			died(new Error(`I/O worker ${index} exited with code ${code}`));
		});
		const init: IoWorkerInit = {
			index,
			hostname: config.hostname,
			port: config.port,
			maxRequestBodySize: config.maxRequestBodySize,
			commandRing,
			resultRing,
			commandBell: commandBell.sab,
			resultBell: resultBell.sab,
		};
		worker.postMessage(init);
		return { lane, ready: ready.promise };
	}

	async function listen(): Promise<{ stop(): Promise<void>; port: number }> {
		const spawned = Array.from({ length: config.workers }, (_, index) =>
			spawn({ index }),
		);
		for (const { lane } of spawned) lanes.push(lane);
		try {
			await Promise.all(spawned.map(({ ready }) => ready));
		} catch (cause) {
			stopping = true;
			for (const { lane } of spawned) lane.worker.terminate();
			throw cause;
		}
		// A frame the loop cannot read means a broken ring; nothing downstream could recover from that.
		drainLoop().catch((cause) => fatal({ cause }));
		async function stop(): Promise<void> {
			stopping = true;
			await Promise.all(
				lanes.map(
					(lane) =>
						new Promise<void>((resolve) => {
							const timer = setTimeout(resolve, 2_000);
							const previous = lane.worker.onmessage;
							lane.worker.onmessage = (
								event: MessageEvent<IoWorkerMessage>,
							) => {
								if (event.data.kind === "stopped") {
									clearTimeout(timer);
									resolve();
								} else previous?.call(lane.worker, event);
							};
							try {
								lane.worker.postMessage({
									kind: "stop",
								} satisfies MainMessage);
							} catch {
								// Already dead: nothing to drain.
								clearTimeout(timer);
								resolve();
							}
						}),
				),
			);
			for (const lane of lanes) lane.worker.terminate();
		}
		return { stop, port: config.port };
	}

	function readStats(): Record<string, Record<string, number>> {
		const out: Record<string, Record<string, number>> = { main: { ...stats } };
		for (const lane of lanes) out[`io${lane.index}`] = lane.stats;
		return out;
	}

	return { listen, readStats };
}
