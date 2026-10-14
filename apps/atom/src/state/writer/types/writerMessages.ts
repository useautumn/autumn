import type { SqliteFileKind, SqliteWriteOp } from "../sqliteWrites.js";

/** What a serving thread hands its writer as the writer starts: the one port both talk over, in FIFO order. */
export type WriterInit = {
	port: MessagePort;
	/** One Int32 the writer bumps after answering an open or close, which the serving thread waits on. */
	answered: SharedArrayBuffer;
	sqliteOpenLock: SharedArrayBuffer;
};

export type WriterRequest =
	| [type: "open", id: number, path: string, kind: SqliteFileKind]
	| [
			type: "write",
			id: number,
			fileId: number,
			op: SqliteWriteOp,
			payload: string,
	  ]
	| [type: "close", id: number, fileId: number];

export type WriterReply =
	| [id: number, ok: true, result: string]
	| [id: number, ok: false, message: string, code: string | null];
