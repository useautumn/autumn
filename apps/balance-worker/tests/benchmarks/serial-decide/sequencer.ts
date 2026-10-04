/**
 * The sequencer: the one thread that owns balance state. It drains the I/O workers' command rings in
 * batches, decides each command against the resident state, and emits the record bytes (to the Kafka
 * worker) and the reply bytes (to the I/O worker that owns the request). It never touches a socket,
 * never lingers, never awaits Kafka on the request path.
 *
 * Two cores share this plumbing:
 *  - `processor`: today's `processor.track()/check()` end to end (writer settlements, run queue, promises);
 *    the writer's commit loop stays here and hands finished batches to the Kafka worker.
 *  - `lean`: the critical section alone (dedup → `mutateTrack` → record bytes → projection → reply bytes),
 *    sequence numbers instead of promises; the Kafka worker owns linger, batching and the commit position.
 */
import type { WorkerErrorResponse } from "@autumn/balance-worker-client/protocol";
import {
	encodeDecisionInto,
	maxDecisionBytes,
	type SplitMeteringRecord,
} from "@autumn/kafka";
import { workerErrorOf } from "../../../src/http/handlers/errorHandler/workerErrorOf.js";
import { pinFromEnv, threadId } from "./pin.js";
import {
	CMD_HEADER,
	FRAME,
	REC_HEADER,
	RES_HEADER,
	type SequencerInit,
} from "./protocol.js";
import { Doorbell, RingConsumer, RingProducer } from "./ring.js";

declare var self: Worker;

export type Command = {
	kind: number;
	reqId: number;
	io: number;
	budgetMs: number;
	text: string;
	/** The `command` value's own bytes inside the request, aliasing the command ring: valid during a synchronous decide only. */
	commandBytes: Uint8Array | null;
};

/** What a core gives back for one command; `seq` is 0 when nothing was recorded or the reply is already durable. */
export type Outcome = { status: number; body: string; seq: number };

export type Core = {
	/** Decides one command. Synchronous when the subject is resident and current; async only on the rare paths. */
	decide(command: Command): Outcome | Promise<Outcome>;
	/** Kafka acknowledged seqs `from..to` at `baseOffset` (negative = failed). */
	onAck(params: { from: number; to: number; baseOffset: bigint }): void;
	stats(): Record<string, number>;
};

/** Shared by both cores: records go out with a seq each; the promise resolves on the batch's ack. */
export type RecordAppender = {
	append(params: { records: { key: Buffer; value: Buffer }[] }): {
		lastSeq: number;
		committed: Promise<bigint>;
	};
	/** Seq for a record emitted directly (lean core). */
	emit(params: { key: Buffer; value: Buffer }): number;
	/** Seq for a record whose key and value are encoded straight into the ring (no Buffers). */
	emitText(params: { key: string; value: string }): number;
	/** Seq for a record emitted as its decision plus the command's own bytes; the Kafka worker joins them. */
	emitSplit(params: {
		split: SplitMeteringRecord;
		commandBytes: Uint8Array;
	}): number;
	flush(): void;
	lastSeq(): number;
	/** Processes any acks waiting in the ack ring now; the core calls it before refusing for capacity, because a
	 *  reply released at the commit position can arrive back as a new command before this thread saw the ack. */
	pumpAcks(): void;
};

if (
	typeof self !== "undefined" &&
	(self as unknown as { postMessage?: unknown }).postMessage &&
	!process.env.SEQUENCER_ON_MAIN
) {
	self.onmessage = (event: MessageEvent) => {
		void start(event.data as SequencerInit, (message) => postMessage(message));
	};
}

export type Report = (message: Record<string, unknown>) => void;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function start(
	init: SequencerInit,
	report: Report,
): Promise<void> {
	const cpus = pinFromEnv({ role: "sequencer" });
	const bell = new Doorbell(init.sequencerBell);
	const commands = init.commandRings.map((layout) => new RingConsumer(layout));
	const results = init.resultRings.map(
		(layout, index) =>
			new RingProducer(
				layout,
				new Doorbell(init.resultBells[index] as SharedArrayBuffer),
			),
	);
	const records = new RingProducer(
		init.recordRing,
		new Doorbell(init.recordBell),
	);
	const acks = new RingConsumer(init.ackRing);
	const stats = {
		drains: 0,
		commands: 0,
		maxDrain: 0,
		sleeps: 0,
		yields: 0,
		resultRingFull: 0,
		recordRingFull: 0,
		errors: 0,
	};
	// Decoding the request bytes to a string happens before the core's own phase timers.
	let decodeNs = 0;

	let seq = 0;
	const awaiting: {
		lastSeq: number;
		resolve(offset: bigint): void;
		reject(error: Error): void;
	}[] = [];
	function writeRecord({ key, value }: { key: Buffer; value: Buffer }): number {
		const next = seq + 1;
		const at = records.claim({
			type: FRAME.REC,
			maxLength: REC_HEADER + key.length + value.length,
		});
		if (at < 0) {
			stats.recordRingFull++;
			throw new Error("record ring full");
		}
		records.payloadView.setUint32(at, next, true);
		records.payloadView.setUint32(at + 4, key.length, true);
		records.payload.set(key, at + REC_HEADER);
		records.payload.set(value, at + REC_HEADER + key.length);
		records.publish({ length: REC_HEADER + key.length + value.length });
		seq = next;
		return next;
	}
	function writeTextRecord({
		key,
		value,
	}: {
		key: string;
		value: string;
	}): number {
		const next = seq + 1;
		const maxLength = REC_HEADER + 3 * (key.length + value.length);
		const at = records.claim({ type: FRAME.REC, maxLength });
		if (at < 0) {
			stats.recordRingFull++;
			throw new Error("record ring full");
		}
		const keyLength = encoder.encodeInto(
			key,
			records.payload.subarray(at + REC_HEADER, at + maxLength),
		).written;
		const valueLength = encoder.encodeInto(
			value,
			records.payload.subarray(at + REC_HEADER + keyLength, at + maxLength),
		).written;
		records.payloadView.setUint32(at, next, true);
		records.payloadView.setUint32(at + 4, keyLength, true);
		records.publish({ length: REC_HEADER + keyLength + valueLength });
		seq = next;
		return next;
	}
	function writeSplitRecord({
		split,
		commandBytes,
	}: {
		split: SplitMeteringRecord;
		commandBytes: Uint8Array;
	}): number {
		const next = seq + 1;
		const at = records.claim({
			type: FRAME.SPLICE,
			maxLength: REC_HEADER + maxDecisionBytes({ split }) + commandBytes.length,
		});
		if (at < 0) {
			stats.recordRingFull++;
			throw new Error("record ring full");
		}
		const decisionLength = encodeDecisionInto({
			split,
			target: records.payload,
			offset: at + REC_HEADER,
		});
		records.payload.set(commandBytes, at + REC_HEADER + decisionLength);
		records.payloadView.setUint32(at, next, true);
		records.payloadView.setUint32(at + 4, decisionLength, true);
		records.publish({
			length: REC_HEADER + decisionLength + commandBytes.length,
		});
		seq = next;
		return next;
	}
	const appender: RecordAppender = {
		emit: writeRecord,
		emitText: writeTextRecord,
		emitSplit: writeSplitRecord,
		append({ records: batch }) {
			let last = 0;
			for (const record of batch) last = writeRecord(record);
			records.flush();
			const { promise, resolve, reject } = Promise.withResolvers<bigint>();
			awaiting.push({ lastSeq: last, resolve, reject });
			return { lastSeq: last, committed: promise };
		},
		flush: () => void records.flush(),
		lastSeq: () => seq,
		pumpAcks: () => drainAcks(),
	};

	// The core's own initialize append needs its ack drained by the loop below, so creation runs beside it.
	let core: Core | null = null;
	const coreReady =
		init.core === "lean"
			? import("./coreLean.js").then((m) =>
					m.createLeanCore({ appender, logRate: init.logRate }),
				)
			: import("./coreProcessor.js").then((m) =>
					m.createProcessorCore({ appender, appenderMode: init.appender }),
				);
	coreReady.then(
		(ready) => {
			core = ready;
			report({ ready: true, role: "sequencer", tid: threadId(), cpus });
		},
		(cause) => {
			console.error("sequencer: core failed", cause);
			process.exit(1);
		},
	);

	function writeResult({
		io,
		reqId,
		outcome,
	}: {
		io: number;
		reqId: number;
		outcome: Outcome;
	}): void {
		const ring = results[io] as RingProducer;
		const maxLength = RES_HEADER + outcome.body.length * 3;
		const at = ring.claim({ type: FRAME.RES, maxLength });
		if (at < 0) {
			stats.resultRingFull++;
			throw new Error(`result ring ${io} full`);
		}
		ring.payloadView.setUint32(at, reqId, true);
		ring.payloadView.setUint32(at + 4, outcome.seq, true);
		ring.payloadView.setUint16(at + 8, outcome.status, true);
		const { written } = encoder.encodeInto(
			outcome.body,
			ring.payload.subarray(at + RES_HEADER, at + maxLength),
		);
		ring.publish({ length: RES_HEADER + written });
		dirty[io] = 1;
	}
	const dirty = new Uint8Array(results.length);

	function drainAcks(): void {
		let n = 0;
		for (;;) {
			const frame = acks.next();
			if (!frame) break;
			const view = acks.payloadView;
			const from = view.getUint32(frame.offset, true);
			const to = view.getUint32(frame.offset + 4, true);
			const baseOffset = view.getBigInt64(frame.offset + 8, true);
			acks.advance();
			n++;
			core?.onAck({ from, to, baseOffset });
			while (
				awaiting.length > 0 &&
				(awaiting[0] as { lastSeq: number }).lastSeq <= to
			) {
				const waiter = awaiting.shift() as (typeof awaiting)[number];
				if (baseOffset >= 0n) waiter.resolve(baseOffset);
				else
					waiter.reject(
						new Error(`batch ${from}..${to} failed (${baseOffset})`),
					);
			}
		}
		if (n > 0) acks.release();
	}

	function settle({
		io,
		reqId,
		outcome,
	}: {
		io: number;
		reqId: number;
		outcome: Outcome;
	}): void {
		writeResult({ io, reqId, outcome });
		if (deferredFlush) return;
		// Outcomes that resolve from promise callbacks (processor core) are flushed once per turn.
		deferredFlush = true;
		setImmediate(flushDirty);
	}
	let deferredFlush = false;
	function flushDirty(): void {
		deferredFlush = false;
		for (let io = 0; io < results.length; io++) {
			if (dirty[io] === 0) continue;
			dirty[io] = 0;
			(results[io] as RingProducer).flush();
		}
		records.flush();
	}

	function drainCommands(ring: RingConsumer, io: number, max: number): number {
		let n = 0;
		while (n < max) {
			const frame = ring.next();
			if (!frame) break;
			if (frame.type !== FRAME.CMD)
				throw new Error(`sequencer: unexpected frame ${frame.type}`);
			const view = ring.payloadView;
			const reqId = view.getUint32(frame.offset, true);
			const kind = ring.payload[frame.offset + 4] as number;
			const budgetMs = view.getUint32(frame.offset + 5, true);
			const commandAt = view.getUint32(frame.offset + 9, true);
			const decodeStart = Bun.nanoseconds();
			const text = decoder.decode(frame.bytes.subarray(CMD_HEADER));
			decodeNs += Bun.nanoseconds() - decodeStart;
			// The slot is not reused before `release`, so the alias outlives a synchronous decide.
			const commandBytes =
				commandAt > 0
					? frame.bytes.subarray(CMD_HEADER + commandAt, frame.length - 1)
					: null;
			ring.advance();
			n++;
			const command: Command = {
				kind,
				reqId,
				io,
				budgetMs,
				text,
				commandBytes,
			};
			let outcome: Outcome | Promise<Outcome>;
			try {
				outcome = (core as Core).decide(command);
			} catch (cause) {
				stats.errors++;
				outcome = errorOutcome(cause);
			}
			if (outcome instanceof Promise) {
				outcome.then(
					(resolved) => settle({ io, reqId, outcome: resolved }),
					(cause) => {
						stats.errors++;
						settle({ io, reqId, outcome: errorOutcome(cause) });
					},
				);
			} else writeResult({ io, reqId, outcome });
		}
		if (n > 0) ring.release();
		return n;
	}

	setInterval(
		() =>
			report({
				stats: {
					...stats,
					...(core?.stats() ?? {}),
					seq,
					us_decode:
						Math.round(decodeNs / Math.max(1, stats.commands) / 10) / 100,
				},
			}),
		5000,
	).unref();

	const MAX_PER_RING = 256;
	let iterations = 0;
	for (;;) {
		let did = 0;
		// Acks first: a released reply's next request can already be in a command ring, and the in-flight
		// cap must see that its predecessor is done before it is counted.
		drainAcks();
		if (core)
			for (let io = 0; io < commands.length; io++) {
				did += drainCommands(commands[io] as RingConsumer, io, MAX_PER_RING);
				drainAcks();
			}
		if (did > 0) {
			stats.drains++;
			stats.commands += did;
			if (did > stats.maxDrain) stats.maxDrain = did;
			flushDirty();
			if (init.yieldEvery > 0 && ++iterations % init.yieldEvery === 0) {
				stats.yields++;
				await new Promise<void>((resolve) => setImmediate(resolve));
			}
			continue;
		}
		stats.sleeps++;
		await bell.sleep({
			hasWork: () =>
				acks.hasWork() ||
				(core !== null && commands.some((ring) => ring.hasWork())),
			timeoutMs: 10,
		});
	}
}

function errorOutcome(cause: unknown): Outcome {
	const { status, error } = workerErrorOf({ cause: cause as Error });
	return {
		status,
		body: JSON.stringify({ error } satisfies WorkerErrorResponse),
		seq: 0,
	};
}
