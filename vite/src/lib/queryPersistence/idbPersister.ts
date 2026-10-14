import type {
	PersistedClient,
	Persister,
} from "@tanstack/react-query-persist-client";

const DB_NAME = "autumn-query-cache";
const STORE_NAME = "clients";
const CLIENT_KEY = "dashboard";
const WRITE_THROTTLE_MS = 1000;

let dbPromise: Promise<IDBDatabase> | null = null;

const openDb = () => {
	dbPromise ??= new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () =>
			request.result.createObjectStore(STORE_NAME);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
	return dbPromise;
};

const runRequest = async <T>({
	mode,
	run,
}: {
	mode: IDBTransactionMode;
	run: (store: IDBObjectStore) => IDBRequest<T>;
}) => {
	const db = await openDb();
	return new Promise<T>((resolve, reject) => {
		const request = run(
			db.transaction(STORE_NAME, mode).objectStore(STORE_NAME),
		);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
};

let pendingClient: PersistedClient | null = null;
let writeScheduled = false;

const flushPendingClient = () => {
	writeScheduled = false;
	const client = pendingClient;
	pendingClient = null;
	if (!client) return;
	// Stored as JSON: structured clone rejects some cached values outright.
	void runRequest({
		mode: "readwrite",
		run: (store) => store.put(JSON.stringify(client), CLIENT_KEY),
	}).catch(() => undefined);
};

/** IndexedDB-backed persister; writes are throttled since every cache update triggers one. */
export const idbPersister: Persister = {
	persistClient: (client) => {
		pendingClient = client;
		if (writeScheduled) return;
		writeScheduled = true;
		setTimeout(flushPendingClient, WRITE_THROTTLE_MS);
	},
	restoreClient: async () => {
		try {
			const stored = await runRequest<string | undefined>({
				mode: "readonly",
				run: (store) => store.get(CLIENT_KEY),
			});
			return stored ? (JSON.parse(stored) as PersistedClient) : undefined;
		} catch {
			return undefined;
		}
	},
	removeClient: async () => {
		pendingClient = null;
		await runRequest({
			mode: "readwrite",
			run: (store) => store.delete(CLIENT_KEY),
		}).catch(() => undefined);
	},
};
