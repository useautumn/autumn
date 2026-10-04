/**
 * The main thread's side of the I/O worker pool: spawns the workers, drains their command rings into
 * the worker's own `fetch` (the Hono app, unchanged), and writes each
 * Response's bytes back to the worker that owns the connection. The main thread never accepts a socket.
 *
 * Under serial-decide arm D a HOT frame is decided here synchronously by the hot decider; its reply goes
 * back with the sequence number the I/O worker holds it on, the worker is woken as commit positions move,
 * and a failed append fails every held reply in its range on every lane. A hot reply too big for the ring
 * is held here instead, released or failed by the same positions. A request the decider declines takes the
 * ordinary fetch path, rebuilt from the same bytes a REQ frame carries.
 */
import type { AutumnLogger } from "@autumn/logging";
import { workerErrorOf } from "../http/handlers/errorHandler/workerErrorOf.js";
import {
	FAIL_HEADER_BYTES,
	HOT_HEADER_BYTES,
	HOT_RES_HEADER_BYTES,
	type HotDecider,
	type HotKind,
	type HotOutcome,
} from "./hotProtocol.js";
import {
	FRAME,
	type IoWorkerInit,
	type IoWorkerMessage,
	LANE_STAT,
	LANE_STAT_SLOTS,
	type MainMessage,
	type OversizedRequest,
	REQ_HEADER_BYTES,
	RES_HEADER_BYTES,
	type RequestMeta,
	type ResponseMeta,
} from "./ioProtocol.js";
import type { PositionBoard } from "./positionBoard.js";
import { POSITION_CELL_BYTES } from "./positionBoard.js";
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
const JSON_CONTENT_TYPE: [string, string] = [
	"content-type",
	"application/json",
];

type HotPosition = { partition: number; seq: number };

/** A frame bound for a lane's result ring, kept until the ring has room for it. */
type ResultFrame =
	| {
			type: typeof FRAME.RES;
			reqId: number;
			status: number;
			meta: string;
			body: Uint8Array;
	  }
	| ({
			type: typeof FRAME.HOT_RES;
			reqId: number;
			status: number;
			meta: string;
			body: Uint8Array;
	  } & HotPosition)
	| {
			type: typeof FRAME.FAIL;
			partition: number;
			aboveSeq: number;
			lastSeq: number;
			status: number;
			body: Uint8Array;
	  };

/** A hot reply the ring could not carry, waiting on its partition's position on this thread. */
type HeldOversized = HotPosition & {
	lane: Lane;
	reqId: number;
	status: number;
	headers: [string, string][];
	body: ArrayBuffer;
};

type Lane = {
	index: number;
	worker: Worker;
	commands: RingConsumer;
	results: RingProducer;
	resultBell: Doorbell;
	stats: Float64Array;
	/** Result frames in production order; a head the full ring cannot take yet holds the rest behind it. */
	outbox: ResultFrame[];
	retry: ReturnType<typeof setTimeout> | undefined;
	dirty: boolean;
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
	if (
		ctx.hot &&
		ctx.hot.positions.cells.byteLength <
			ctx.hot.decider.partitionCount * POSITION_CELL_BYTES
	)
		throw new RangeError(
			"the position board has fewer cells than the hot decider's partitions",
		);
	const commandRingBytes = config.commandRingBytes ?? 4 << 20;
	const resultRingBytes = config.resultRingBytes ?? 16 << 20;
	// Like the command side: a frame over an eighth of the ring could need more contiguous room than the ring
	// can ever free (a wrap costs the tail), and a frame the ring never takes would hold the lane's outbox for good.
	const maxResultFrameBytes = resultRingBytes >>> 3;
	const commandBell = new Doorbell();
	const lanes: Lane[] = [];
	const stats = {
		drains: 0,
		requests: 0,
		oversized: 0,
		resultRingWaits: 0,
		sleeps: 0,
		hot: 0,
		hotFallback: 0,
		hotErrors: 0,
		hotFailed: 0,
		hotHeldHere: 0,
	};
	let stopping = false;
	let failed = false;
	// Per partition, in seq order; only replies over an eighth of the ring land here.
	const heldOversized = new Map<number, HeldOversized[]>();
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

	function frameBytes(frame: ResultFrame): number {
		if (frame.type === FRAME.FAIL) return FAIL_HEADER_BYTES + frame.body.length;
		const headerBytes =
			frame.type === FRAME.RES ? RES_HEADER_BYTES : HOT_RES_HEADER_BYTES;
		return headerBytes + frame.meta.length * 3 + frame.body.length;
	}

	/** Writes one frame to the lane's result ring; false when the ring has no room for it right now. */
	function writeFrame({
		lane,
		frame,
	}: {
		lane: Lane;
		frame: ResultFrame;
	}): boolean {
		const maxLength = frameBytes(frame);
		const at = lane.results.claim({ type: frame.type, maxLength });
		if (at < 0) return false;
		const view = lane.results.payloadView;
		const payload = lane.results.payload;
		if (frame.type === FRAME.FAIL) {
			view.setUint16(at, frame.partition, true);
			view.setFloat64(at + 2, frame.aboveSeq, true);
			view.setFloat64(at + 10, frame.lastSeq, true);
			view.setUint16(at + 18, frame.status, true);
			payload.set(frame.body, at + FAIL_HEADER_BYTES);
			lane.results.publish({ length: FAIL_HEADER_BYTES + frame.body.length });
		} else {
			const headerBytes =
				frame.type === FRAME.RES ? RES_HEADER_BYTES : HOT_RES_HEADER_BYTES;
			view.setUint32(at, frame.reqId, true);
			view.setUint16(at + 4, frame.status, true);
			if (frame.type === FRAME.HOT_RES) {
				view.setUint16(at + 6, frame.partition, true);
				view.setFloat64(at + 8, frame.seq, true);
			}
			const { written } = encoder.encodeInto(
				frame.meta,
				payload.subarray(at + headerBytes, at + maxLength - frame.body.length),
			);
			view.setUint32(at + headerBytes - 4, written, true);
			payload.set(frame.body, at + headerBytes + written);
			lane.results.publish({
				length: headerBytes + written + frame.body.length,
			});
		}
		lane.dirty = true;
		scheduleFlush();
		return true;
	}

	function pump(lane: Lane): void {
		while (lane.outbox.length > 0) {
			if (writeFrame({ lane, frame: lane.outbox[0] })) {
				lane.outbox.shift();
				continue;
			}
			if (stopping) return;
			// A full result ring means the worker is behind on reads; it drains continuously, so wait a turn.
			stats.resultRingWaits++;
			flushDirty();
			lane.retry = setTimeout(() => {
				lane.retry = undefined;
				pump(lane);
			}, 1);
			return;
		}
	}

	/** Queues a frame on the lane's result ring behind everything queued before it. */
	function send({ lane, frame }: { lane: Lane; frame: ResultFrame }): void {
		lane.outbox.push(frame);
		if (lane.outbox.length === 1) pump(lane);
	}

	function reply({
		lane,
		reqId,
		status,
		headers,
		body,
		hot,
	}: {
		lane: Lane;
		reqId: number;
		status: number;
		headers: [string, string][];
		body: Uint8Array;
		hot?: HotPosition;
	}): void {
		const meta = JSON.stringify({ h: headers } satisfies ResponseMeta);
		const frame: ResultFrame = hot
			? { type: FRAME.HOT_RES, reqId, status, meta, body, ...hot }
			: { type: FRAME.RES, reqId, status, meta, body };
		if (frameBytes(frame) <= maxResultFrameBytes) {
			send({ lane, frame });
			return;
		}
		// Transferred, so the bytes must be a whole buffer of their own.
		const buffer =
			body.buffer instanceof ArrayBuffer &&
			body.byteOffset === 0 &&
			body.byteLength === body.buffer.byteLength
				? body.buffer
				: body.slice().buffer;
		if (hot && hot.seq > 0) {
			holdOversized({ ...hot, lane, reqId, status, headers, body: buffer });
			return;
		}
		postResponse({ lane, reqId, status, headers, body: buffer });
	}

	function postResponse({
		lane,
		reqId,
		status,
		headers,
		body,
	}: {
		lane: Lane;
		reqId: number;
		status: number;
		headers: [string, string][];
		body: ArrayBuffer;
	}): void {
		lane.worker.postMessage(
			{
				kind: "response",
				reqId,
				status,
				meta: { h: headers },
				body,
			} satisfies MainMessage,
			[body],
		);
	}

	/** Holds a big hot reply here until the partition's position reaches its seq, or answers it now when it already has. */
	function holdOversized(held: HeldOversized): void {
		if (!ctx.hot)
			throw new Error("I/O pool: a hot reply without a hot decider");
		if (
			ctx.hot.positions.readCommitPos({ partition: held.partition }) >= held.seq
		) {
			postResponse(held);
			return;
		}
		const queue = heldOversized.get(held.partition) ?? [];
		let at = queue.length;
		while (at > 0 && queue[at - 1].seq > held.seq) at--;
		queue.splice(at, 0, held);
		heldOversized.set(held.partition, queue);
		stats.hotHeldHere++;
	}

	function releaseOversized({
		partition,
		seq,
	}: {
		partition: number;
		seq: number;
	}): void {
		const queue = heldOversized.get(partition);
		if (!queue) return;
		let n = 0;
		while (n < queue.length && queue[n].seq <= seq) n++;
		for (const held of queue.splice(0, n)) postResponse(held);
		if (queue.length === 0) heldOversized.delete(partition);
	}

	function failOversized({
		partition,
		aboveSeq,
		lastSeq,
		status,
		body,
	}: {
		partition: number;
		aboveSeq: number;
		lastSeq: number;
		status: number;
		body: Uint8Array;
	}): void {
		const queue = heldOversized.get(partition);
		if (!queue) return;
		const kept: HeldOversized[] = [];
		for (const held of queue) {
			if (held.seq <= aboveSeq || held.seq > lastSeq) {
				kept.push(held);
				continue;
			}
			postResponse({
				lane: held.lane,
				reqId: held.reqId,
				status,
				headers: [JSON_CONTENT_TYPE],
				body: body.slice().buffer,
			});
		}
		if (kept.length === 0) heldOversized.delete(partition);
		else heldOversized.set(partition, kept);
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
		reply({ lane, reqId, status: response.status, headers, body });
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

	function answerHot({
		lane,
		reqId,
		outcome,
	}: {
		lane: Lane;
		reqId: number;
		outcome: HotOutcome;
	}): void {
		try {
			reply({
				lane,
				reqId,
				status: outcome.status,
				headers: [JSON_CONTENT_TYPE, ...(outcome.headers ?? [])],
				body:
					typeof outcome.body === "string"
						? encoder.encode(outcome.body)
						: outcome.body,
				hot: { partition: outcome.partition, seq: outcome.seq },
			});
		} catch (cause) {
			fatal({ cause });
		}
	}

	/** A decider failure is answered like a fetch failure: a bare 500, released at once. */
	function answerHotFailure({
		lane,
		reqId,
		cause,
	}: {
		lane: Lane;
		reqId: number;
		cause: unknown;
	}): void {
		stats.hotErrors++;
		ctx.logger.error({ error: cause }, "Hot decide failed on the main thread");
		try {
			reply({ lane, reqId, status: 500, headers: [], body: new Uint8Array(0) });
		} catch (cause) {
			fatal({ cause });
		}
	}

	function decideHot({
		lane,
		reqId,
		kind,
		budgetMs,
		deadlineAt,
		meta,
		body,
	}: {
		lane: Lane;
		reqId: number;
		kind: HotKind;
		budgetMs: number;
		deadlineAt: number;
		meta: RequestMeta;
		body: Uint8Array;
	}): void {
		if (!ctx.hot)
			throw new Error("I/O pool: a HOT frame without a hot decider");
		stats.hot++;
		let outcome: HotOutcome | null;
		try {
			outcome = ctx.hot.decider.decide({
				kind,
				body,
				budgetMs: budgetMs > 0 ? budgetMs : undefined,
				deadlineAt: deadlineAt > 0 ? deadlineAt : undefined,
			});
		} catch (cause) {
			answerHotFailure({ lane, reqId, cause });
			return;
		}
		if (outcome === null) {
			stats.hotFallback++;
			void serve({ lane, reqId, request: requestOf({ meta, body }) });
			return;
		}
		answerHot({ lane, reqId, outcome });
	}

	function drainLane(lane: Lane): number {
		let n = 0;
		while (n < MAX_FRAMES_PER_DRAIN) {
			const frame = lane.commands.next();
			if (!frame) break;
			const view = lane.commands.payloadView;
			if (frame.type === FRAME.HOT) {
				const reqId = view.getUint32(frame.offset, true);
				const kind = view.getUint8(frame.offset + 4) as HotKind;
				const budgetMs = view.getUint32(frame.offset + 5, true);
				const deadlineAt = view.getFloat64(frame.offset + 9, true);
				const metaLength = view.getUint32(frame.offset + 17, true);
				const meta = JSON.parse(
					decoder.decode(
						frame.bytes.subarray(
							HOT_HEADER_BYTES,
							HOT_HEADER_BYTES + metaLength,
						),
					),
				) as RequestMeta;
				// The decider keeps the body, so it is copied out of the ring before the slot is released.
				const body = frame.bytes.slice(HOT_HEADER_BYTES + metaLength);
				lane.commands.advance();
				n++;
				decideHot({ lane, reqId, kind, budgetMs, deadlineAt, meta, body });
				continue;
			}
			if (frame.type !== FRAME.REQ)
				throw new Error(`I/O pool: unexpected frame ${frame.type}`);
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

	/** Every lane learns that nothing in (`seq`, `lastSeq`] reached the log; the worker answers its held replies in that range. */
	function failHeldAbove({
		partition,
		seq,
		lastSeq,
		cause,
	}: {
		partition: number;
		seq: number;
		lastSeq: number;
		cause: unknown;
	}): void {
		stats.hotFailed++;
		const { status, error } = workerErrorOf({ cause });
		const body = encoder.encode(JSON.stringify({ error }));
		for (const lane of lanes)
			send({
				lane,
				frame: {
					type: FRAME.FAIL,
					partition,
					aboveSeq: seq,
					lastSeq,
					status,
					body,
				},
			});
		failOversized({ partition, aboveSeq: seq, lastSeq, status, body });
	}

	function spawn({ index }: { index: number }): {
		lane: Lane;
		ready: Promise<void>;
	} {
		const commandRing = allocateRing({ capacity: commandRingBytes });
		const resultRing = allocateRing({ capacity: resultRingBytes });
		const resultBell = new Doorbell();
		const laneStats = new SharedArrayBuffer(LANE_STAT_SLOTS * 8);
		const worker = new Worker(new URL("./ioWorker.ts", import.meta.url).href, {
			name: `balance-worker-io-${index}`,
		});
		const lane: Lane = {
			index,
			worker,
			commands: new RingConsumer(commandRing),
			results: new RingProducer(resultRing, resultBell),
			resultBell,
			stats: new Float64Array(laneStats),
			outbox: [],
			retry: undefined,
			dirty: false,
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
			stats: laneStats,
			hot: ctx.hot && {
				cells: ctx.hot.positions.cells,
				failGenerations: ctx.hot.positions.failGenerations,
				partitionCount: ctx.hot.decider.partitionCount,
			},
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
		const unsubscribe = ctx.hot
			? [
					// The worker reads the position itself; the bell only wakes it to look.
					ctx.hot.positions.onCommitted((position) => {
						for (const lane of lanes) lane.resultBell.ring();
						releaseOversized(position);
					}),
					ctx.hot.positions.onFailedAbove(failHeldAbove),
				]
			: [];
		async function stop(): Promise<void> {
			stopping = true;
			for (const off of unsubscribe) off();
			for (const lane of lanes) clearTimeout(lane.retry);
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
		for (const lane of lanes) {
			const counters: Record<string, number> = {};
			for (const [name, slot] of Object.entries(LANE_STAT))
				counters[name] = lane.stats[slot];
			out[`io${lane.index}`] = counters;
		}
		return out;
	}

	return { listen, readStats };
}
