import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isMainThread, receiveMessageOnPort } from "node:worker_threads";
import { getAtomLogger } from "../../lib/logging/getAtomLogger.js";
import { getSqliteOpenLock } from "../newSqliteConnection.js";
import type { SqliteFileKind, SqliteWriteOp } from "./sqliteWrites.js";
import type {
	WriterInit,
	WriterReply,
	WriterRequest,
} from "./types/writerMessages.js";

const DIED_MESSAGE = "The SQLite writer thread died";
/** An open or close blocks the serving thread as it did when the thread did it itself; a writer that never answers fails it. */
const SYNC_TIMEOUT_MS = 60_000;
const SYNC_WAIT_SLICE_MS = 100;
/** Wait histogram buckets: four per doubling of µs, up to ~17 min. */
const BUCKETS_PER_DOUBLING = 4;
const BUCKETS = 120;

type SqliteWriter = {
	/** Synchronous: the file exists with its schema once this returns, so the serving thread can open its reader. */
	open(params: { path: string; kind: SqliteFileKind }): number;
	write(params: {
		fileId: number;
		op: SqliteWriteOp;
		payload: string;
	}): Promise<string>;
	/** Synchronous too: the file is closed, its log checkpointed, once this returns. */
	close(params: { fileId: number }): void;
};

type Pending = {
	resolve(result: string): void;
	reject(error: Error): void;
	postedAt: number;
};

/** Writes this thread's writer answered since boot, and their waits since the stats tick last read them: module state is the thread's own. */
let roundTrips = 0;
const waitBuckets = new Array<number>(BUCKETS).fill(0);

const recordWait = ({ waitUs }: { waitUs: number }) => {
	roundTrips++;
	const bucket = Math.floor(Math.log2(1 + waitUs) * BUCKETS_PER_DOUBLING);
	waitBuckets[Math.min(BUCKETS - 1, bucket)]++;
};

/** The writer's round trips since boot, and the p99 of their waits (post to reply) since the last read, in µs. */
export const readSqliteWriterThreadStats = () => {
	const waits = waitBuckets.reduce((sum, count) => sum + count, 0);
	let p99Bucket = 0;
	for (let seen = 0; p99Bucket < BUCKETS; p99Bucket++) {
		seen += waitBuckets[p99Bucket] ?? 0;
		if (seen >= waits * 0.99) break;
	}
	waitBuckets.fill(0);
	return {
		sqliteWriterRoundTrips: roundTrips,
		sqliteWriterWaitP99Us:
			waits === 0
				? 0
				: Math.round(2 ** ((p99Bucket + 1) / BUCKETS_PER_DOUBLING) - 1),
	};
};

const errorOf = (reply: WriterReply & { 1: false }): Error =>
	Object.assign(
		new Error(reply[2]),
		reply[3] === null ? {} : { code: reply[3] },
	);

const WRITER_ENTRY = new URL("./sqliteWriterEntry.ts", import.meta.url);

/**
 * Run from source, the writer loads its own small module graph; a compiled Atom has no source path to load, so its
 * writer is the program started again, as a serving thread is (main.ts dispatches on `atomSqliteWriter`).
 */
const spawnOwnWriter = (): Worker =>
	existsSync(fileURLToPath(WRITER_ENTRY))
		? new Worker(WRITER_ENTRY.href)
		: new Worker(Bun.main, {
				workerData: { atomSqliteWriter: true },
			} as WorkerOptions);

let spawnWriter = spawnOwnWriter;

/** Starts this thread's writer with `spawn` instead, so a test holds its Worker, as createAtomThreads' `spawnThread` does. */
export const spawnSqliteWriterWith = ({
	spawn,
}: {
	spawn: () => Worker;
}): void => {
	spawnWriter = spawn;
};

/** Bun's Worker, which can stop holding the process open. */
type RefWorker = Worker & { ref(): void; unref(): void };

const startSqliteWriter = (): SqliteWriter => {
	const worker = spawnWriter() as RefWorker;
	const { port1: port, port2 } = new MessageChannel();
	const answered = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
	const answeredCount = new Int32Array(answered);
	worker.postMessage(
		{
			port: port2,
			answered,
			sqliteOpenLock: getSqliteOpenLock(),
		} satisfies WriterInit,
		[port2],
	);
	// Holds the process open only while a write waits on it, so a process with nothing to write can exit.
	worker.unref();
	const pending = new Map<number, Pending>();
	let nextId = 1;
	let died: Error | null = null;

	function settle(reply: WriterReply): void {
		const waiting = pending.get(reply[0]);
		if (!waiting) return;
		pending.delete(reply[0]);
		if (pending.size === 0) worker.unref();
		recordWait({ waitUs: (performance.now() - waiting.postedAt) * 1000 });
		if (reply[1]) waiting.resolve(reply[2]);
		else waiting.reject(errorOf(reply));
	}
	port.onmessage = (event: MessageEvent<WriterReply>) => settle(event.data);

	/** Nothing it had not answered is acknowledged; a serving thread then ends, and the main thread replaces it. */
	function die(): void {
		if (died) return;
		died = new Error(DIED_MESSAGE);
		for (const waiting of pending.values()) waiting.reject(died);
		const failed = pending.size;
		pending.clear();
		port.close();
		getAtomLogger().error(
			{ type: "atom_sqlite_writer_died", data: { failed } },
			`${DIED_MESSAGE}; ${failed} writes failed`,
		);
		if (!isMainThread) setImmediate(() => process.exit(1));
	}
	worker.addEventListener("close", die);

	function post(request: WriterRequest): void {
		if (died) throw died;
		port.postMessage(request);
	}

	/** Blocks until the writer answers this request, settling the writes it answers first on the way. */
	function callSync(request: WriterRequest & { 0: "open" | "close" }): void {
		const id = request[1];
		const seen = Atomics.load(answeredCount, 0);
		post(request);
		const deadline = performance.now() + SYNC_TIMEOUT_MS;
		for (;;) {
			const received = receiveMessageOnPort(port as never);
			if (received) {
				const reply = received.message as WriterReply;
				if (reply[0] !== id) {
					settle(reply);
					continue;
				}
				if (!reply[1]) throw errorOf(reply);
				return;
			}
			if (performance.now() > deadline)
				throw new Error(`The SQLite writer did not answer ${request[0]}`);
			Atomics.wait(answeredCount, 0, seen, SYNC_WAIT_SLICE_MS);
		}
	}

	function open({ path, kind }: { path: string; kind: SqliteFileKind }) {
		const id = nextId++;
		callSync(["open", id, path, kind]);
		return id;
	}

	function write({
		fileId,
		op,
		payload,
	}: {
		fileId: number;
		op: SqliteWriteOp;
		payload: string;
	}): Promise<string> {
		if (died) return Promise.reject(died);
		const id = nextId++;
		const { promise, resolve, reject } = Promise.withResolvers<string>();
		if (pending.size === 0) worker.ref();
		pending.set(id, { resolve, reject, postedAt: performance.now() });
		port.postMessage([
			"write",
			id,
			fileId,
			op,
			payload,
		] satisfies WriterRequest);
		return promise;
	}

	return {
		open,
		write,
		close: ({ fileId }) => {
			if (!died) callSync(["close", nextId++, fileId]);
		},
	};
};

let writer: SqliteWriter | null = null;

/** This thread's one writer, started with its first file: every write of the thread's files commits there, in the order sent. */
export const getSqliteWriter = (): SqliteWriter => {
	writer ??= startSqliteWriter();
	return writer;
};
