import type { TrackReply } from "@autumn/balance-worker-client";
import type {
	CheckReply,
	PartitionRoute,
	WorkerErrorResponse,
} from "@autumn/balance-worker-client/protocol";
import {
	looksLikeCheckCommand,
	looksLikeTrackCommand,
} from "../../../src/http/commands/looksLikeCommands.js";
import { workerErrorOf } from "../../../src/http/handlers/errorHandler/workerErrorOf.js";
import {
	logWorkerRequest,
	nextRequestLogId,
} from "../../../src/http/middlewares/requestLoggingMiddleware.js";
import { resolveRequestRuntime } from "../../../src/http/middlewares/runtimeRouting/resolveRequestRuntime.js";
import { withRequestBudget } from "../../../src/http/middlewares/runtimeRouting/withRequestBudget.js";
import {
	serializeCheckReply,
	serializeSubjectReply,
} from "../../../src/http/replies/serializeSubjectReply.js";
import type { BalanceWorkerRequestLog } from "../../../src/http/types/balanceWorkerHttp.js";
import type { PartitionProcessor } from "../../../src/processor/types/partitionProcessor.js";
import { type AppenderMode, createSpikeWorker } from "./createSpikeWorker.js";

/**
 * (b) the decide core: Bun keeps the engine, the writer and the reply bytes; the Rust front owns HTTP.
 * Frames are u32le length + u8 type; one DECIDE frame carries every request the front read since its last write.
 */
const T_DECIDE = 1;
const T_RESULTS = 2;
const T_APPEND = 3;
const T_APPEND_ACK = 4;

type Reply = TrackReply | CheckReply;
type Route = {
	path: string;
	accepts(input: unknown): boolean;
	run(processor: PartitionProcessor, command: unknown): Promise<Reply>;
	serialize(reply: Reply): string;
};

const ROUTES: Record<number, Route> = {
	1: {
		path: "/v1/track",
		accepts: looksLikeTrackCommand,
		run: (processor, command) => processor.track({ command: command as never }),
		serialize: (reply) => serializeSubjectReply({ reply }),
	},
	2: {
		path: "/v1/check",
		accepts: looksLikeCheckCommand,
		run: (processor, command) => processor.check({ command: command as never }),
		serialize: (reply) => serializeCheckReply({ reply: reply as CheckReply }),
	},
};

const INVALID = JSON.stringify({
	error: { code: "INVALID_REQUEST", message: "Invalid request" },
} satisfies WorkerErrorResponse);

const socketPath = process.env.SPIKE_SOCKET ?? "/tmp/bw-decide.sock";
const appenderMode = (process.env.SPIKE_APPENDER ?? "kafkajs") as AppenderMode;

let socket: Bun.Socket<undefined> | null = null;
const outbox: Buffer[] = [];

/** Frames written before the front connects (the subject's initialize append) wait in the outbox.
 *  A frame may be a view of the reused scratch buffer, so whatever the kernel does not take is copied. */
function send(frame: Buffer): void {
	if (!socket || outbox.length > 0) {
		outbox.push(Buffer.from(frame));
		return;
	}
	const written = socket.write(frame);
	if (written < frame.length)
		outbox.push(Buffer.from(frame.subarray(Math.max(0, written))));
}

function drain(): void {
	while (socket && outbox.length > 0) {
		const frame = outbox[0] as Buffer;
		const written = socket.write(frame);
		if (written < frame.length) {
			outbox[0] = frame.subarray(Math.max(0, written));
			return;
		}
		outbox.shift();
	}
}

/** Appends cross back to the front, which owns the producer; the writer still awaits the base offset. */
let nextAppendId = 0;
const appends = new Map<
	number,
	{ resolve(offset: bigint): void; reject(error: Error): void }
>();
const topicBytes = new Map<string, Buffer>();

function remoteAppend({
	topic,
	partition,
	records,
}: {
	topic: string;
	partition: number;
	records: { key: Buffer; value: Buffer }[];
}): Promise<bigint> {
	let topicName = topicBytes.get(topic);
	if (!topicName) {
		topicName = Buffer.from(topic);
		topicBytes.set(topic, topicName);
	}
	let size = 4 + 1 + 4 + 4 + 2 + topicName.length + 4;
	for (const { key, value } of records) size += 8 + key.length + value.length;
	const frame = Buffer.allocUnsafe(size);
	const id = nextAppendId++;
	let p = frame.writeUInt32LE(size - 4, 0);
	frame[p++] = T_APPEND;
	p = frame.writeUInt32LE(id, p);
	p = frame.writeUInt32LE(partition, p);
	p = frame.writeUInt16LE(topicName.length, p);
	p += topicName.copy(frame, p);
	p = frame.writeUInt32LE(records.length, p);
	for (const { key, value } of records) {
		p = frame.writeUInt32LE(key.length, p);
		p += key.copy(frame, p);
		p = frame.writeUInt32LE(value.length, p);
		p += value.copy(frame, p);
	}
	return new Promise((resolve, reject) => {
		appends.set(id, { resolve, reject });
		send(frame);
	});
}

// Not awaited: with the remote appender the subject's initialize waits on the front, which connects after listen.
const workerReady = createSpikeWorker({ appenderMode, remoteAppend });
let worker: Awaited<typeof workerReady> | undefined;
workerReady.then((ready) => {
	worker = ready;
});

type Result = { id: number; status: number; body: string };
let results: Result[] = [];
let flushScheduled = false;
const stats = { frames: 0, decides: 0, resultFrames: 0 };

function pushResult(result: Result): void {
	results.push(result);
	if (flushScheduled) return;
	flushScheduled = true;
	setImmediate(flushResults);
}

let scratch = Buffer.allocUnsafe(4 << 20);

/** One RESULTS frame for everything settled this turn, written into a reused buffer (no byteLength pass). */
function flushResults(): void {
	flushScheduled = false;
	const batch = results;
	results = [];
	let p = 9;
	for (const { id, status, body } of batch) {
		// utf8 is at most 3 bytes per UTF-16 unit.
		if (scratch.length - p < 10 + body.length * 3) {
			const grown = Buffer.allocUnsafe(Math.max(scratch.length * 2, p + 10 + body.length * 3));
			scratch.copy(grown, 0, 0, p);
			scratch = grown;
		}
		scratch.writeUInt32LE(id, p);
		scratch.writeUInt16LE(status, p + 4);
		const length = scratch.write(body, p + 10, "utf8");
		scratch.writeUInt32LE(length, p + 6);
		p += 10 + length;
	}
	scratch.writeUInt32LE(p - 4, 0);
	scratch[4] = T_RESULTS;
	scratch.writeUInt32LE(batch.length, 5);
	stats.resultFrames++;
	send(scratch.subarray(0, p));
}

/** The fast path's semantics, minus HTTP: route check, budget, decide, the reply's exact bytes, the sampled log line. */
async function decideOne({
	id,
	kind,
	route,
	budgetMs,
	text,
}: {
	id: number;
	kind: number;
	route: PartitionRoute;
	budgetMs: number | undefined;
	text: string;
}): Promise<void> {
	const handler = ROUTES[kind];
	let command: unknown;
	try {
		command = JSON.parse(text);
	} catch {
		command = undefined;
	}
	if (!handler || !handler.accepts(command)) {
		pushResult({ id, status: 400, body: INVALID });
		return;
	}
	const { ctx } = worker ?? (await workerReady);
	const requestLog: BalanceWorkerRequestLog = { id: nextRequestLogId() };
	const startedAt = performance.now();
	let status = 200;
	let body: string;
	try {
		const runtime = withRequestBudget({
			runtime: await resolveRequestRuntime({
				ctx,
				route,
				command,
			}),
			budgetMs,
		});
		requestLog.command = command as BalanceWorkerRequestLog["command"];
		const reply = await runtime.process<Reply>((processor) =>
			handler.run(processor, command),
		);
		requestLog.response = reply;
		body = handler.serialize(reply);
	} catch (cause) {
		const { status: errorStatus, error } = workerErrorOf({
			cause: cause as Error,
		});
		if (error.code !== "OVERLOADED") requestLog.error = cause as Error;
		requestLog.errorCode = error.code;
		status = errorStatus;
		body = JSON.stringify({ error } satisfies WorkerErrorResponse);
	}
	pushResult({ id, status, body });
	logWorkerRequest({
		ctx,
		requestLog,
		statusCode: status,
		method: "POST",
		path: handler.path,
		route,
		startedAt,
	});
}

const epochs = new Map<string, PartitionRoute>();

function handleDecide(frame: Buffer, start: number): void {
	let p = start;
	const count = frame.readUInt32LE(p);
	p += 4;
	stats.frames++;
	stats.decides += count;
	for (let i = 0; i < count; i++) {
		const id = frame.readUInt32LE(p);
		const kind = frame[p + 4] as number;
		const partition = frame.readUInt32LE(p + 5);
		const budget = frame.readUInt32LE(p + 9);
		const epochLength = frame.readUInt16LE(p + 13);
		p += 15;
		const routeEpoch = frame.toString("utf8", p, p + epochLength);
		p += epochLength;
		const commandLength = frame.readUInt32LE(p);
		p += 4;
		const text = frame.toString("utf8", p, p + commandLength);
		p += commandLength;
		const routeKey = `${partition}:${routeEpoch}`;
		let route = epochs.get(routeKey);
		if (!route) {
			route = { partition, routeEpoch } as PartitionRoute;
			epochs.set(routeKey, route);
		}
		void decideOne({
			id,
			kind,
			route,
			budgetMs: budget === 0 ? undefined : budget,
			text,
		});
	}
}

function handleAck(frame: Buffer, start: number): void {
	const id = frame.readUInt32LE(start);
	const ok = frame[start + 4] === 1;
	const pending = appends.get(id);
	if (!pending) return;
	appends.delete(id);
	if (ok) pending.resolve(frame.readBigInt64LE(start + 5));
	else {
		const length = frame.readUInt32LE(start + 5);
		pending.reject(
			new Error(frame.toString("utf8", start + 9, start + 9 + length)),
		);
	}
}

let inbox: Buffer | null = null;

function onData(chunk: Buffer): void {
	const buffer = inbox ? Buffer.concat([inbox, chunk]) : chunk;
	let offset = 0;
	while (buffer.length - offset >= 4) {
		const length = buffer.readUInt32LE(offset);
		if (buffer.length - offset - 4 < length) break;
		const type = buffer[offset + 4];
		if (type === T_DECIDE) handleDecide(buffer, offset + 5);
		else if (type === T_APPEND_ACK) handleAck(buffer, offset + 5);
		else throw new Error(`unknown frame ${type}`);
		offset += 4 + length;
	}
	inbox = offset < buffer.length ? Buffer.from(buffer.subarray(offset)) : null;
}

await Bun.file(socketPath)
	.delete()
	.catch(() => undefined);
Bun.listen({
	unix: socketPath,
	socket: {
		open(s) {
			socket = s;
			drain();
		},
		data(_s, chunk) {
			onData(chunk as Buffer);
		},
		drain() {
			drain();
		},
		close() {
			socket = null;
			console.error("front disconnected");
			process.exit(0);
		},
	},
});
setInterval(() => {
	if (stats.frames === 0) return;
	console.error(
		`core: ${stats.decides} decides in ${stats.frames} frames (avg ${(stats.decides / stats.frames).toFixed(1)}), ${stats.resultFrames} result frames (avg ${(stats.decides / Math.max(1, stats.resultFrames)).toFixed(1)})`,
	);
	stats.frames = 0;
	stats.decides = 0;
	stats.resultFrames = 0;
}, 5000).unref();
console.error(`decide core on ${socketPath} (appender ${appenderMode})`);

process.on("SIGTERM", () => process.exit(0));
