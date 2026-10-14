import type { Database } from "bun:sqlite";
import { parentPort } from "node:worker_threads";
import { shareSqliteOpenLock } from "../newSqliteConnection.js";
import { SQLITE_FILE_OPENERS, SQLITE_WRITES } from "./sqliteWrites.js";
import type {
	WriterInit,
	WriterReply,
	WriterRequest,
} from "./types/writerMessages.js";

const replyOf = ({
	id,
	error,
}: {
	id: number;
	error: unknown;
}): WriterReply => [
	id,
	false,
	error instanceof Error ? error.message : String(error),
	error instanceof Error && "code" in error ? String(error.code) : null,
];

/** Owns every write connection of one serving thread's slot and journal files, and runs their writes in the order sent. */
const serve = ({ port, answered, sqliteOpenLock }: WriterInit): void => {
	shareSqliteOpenLock({ lock: sqliteOpenLock });
	const files = new Map<number, Database>();
	const answeredCount = new Int32Array(answered);

	function answer(request: WriterRequest): WriterReply {
		const id = request[1];
		try {
			if (request[0] === "close") {
				const [, , fileId] = request;
				files.get(fileId)?.close();
				files.delete(fileId);
				return [id, true, ""];
			}
			if (request[0] === "open") {
				const [, , path, kind] = request;
				files.set(id, SQLITE_FILE_OPENERS[kind]({ databasePath: path }));
				return [id, true, ""];
			}
			const [, , fileId, op, payload] = request;
			const sqliteDb = files.get(fileId);
			if (!sqliteDb)
				throw new Error(`No file ${fileId} is open on the SQLite writer`);
			return [id, true, SQLITE_WRITES[op]({ ctx: { sqliteDb }, payload })];
		} catch (error) {
			return replyOf({ id, error });
		}
	}

	port.onmessage = (event: MessageEvent<WriterRequest>) => {
		port.postMessage(answer(event.data));
		// The serving thread blocks on an open or close; this wakes it to take the reply.
		if (event.data[0] !== "write") {
			Atomics.add(answeredCount, 0, 1);
			Atomics.notify(answeredCount, 0);
		}
	};
};

/** Runs in the worker a serving thread started as its writer: the first message is its port. */
export const runSqliteWriterThread = (): void => {
	const parent = parentPort;
	if (!parent) throw new Error("runSqliteWriterThread runs in a worker thread");
	parent.once("message", (init: WriterInit) => serve(init));
};
