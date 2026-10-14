import { Database, type DatabaseOptions } from "bun:sqlite";

const UNLOCKED = 0;
const LOCKED = 1;

let openLock: SharedArrayBuffer | null = null;

export const getSqliteOpenLock = (): SharedArrayBuffer => {
	openLock ??= new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
	return openLock;
};

export const shareSqliteOpenLock = ({
	lock,
}: {
	lock: SharedArrayBuffer;
}): void => {
	openLock = lock;
};

/**
 * bun:sqlite appends every connection to one process-wide list without a lock (JSSQLStatement.cpp `databases()`):
 * two threads opening at once get the same handle or corrupt the heap, so every open in the process takes turns.
 */
export const newSqliteConnection = ({
	path,
	options,
}: {
	path: string;
	options: DatabaseOptions;
}): Database => {
	const lock = new Int32Array(getSqliteOpenLock());
	while (Atomics.compareExchange(lock, 0, UNLOCKED, LOCKED) !== UNLOCKED)
		Atomics.wait(lock, 0, LOCKED);
	try {
		return new Database(path, options);
	} finally {
		Atomics.store(lock, 0, UNLOCKED);
		Atomics.notify(lock, 0, 1);
	}
};
