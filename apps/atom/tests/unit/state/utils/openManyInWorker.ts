import { isMainThread, parentPort, workerData } from "node:worker_threads";
import {
	getSqliteOpenLock,
	newSqliteConnection,
	shareSqliteOpenLock,
} from "../../../../src/state/newSqliteConnection.js";

/** Run as a script: workers open connections all at once, the way a replica's threads boot, and print each one's handles. */
export const OPEN_MANY_PATH = import.meta.path;
const WORKERS = 5;
const CONNECTIONS = 2000;

const openMany = ({ marker }: { marker: number }) => {
	const handles: number[] = [];
	let misrouted = 0;
	for (let index = 0; index < CONNECTIONS; index++) {
		const database = newSqliteConnection({
			path: ":memory:",
			options: { create: true },
		});
		handles.push((database as unknown as { handle: number }).handle);
		database.run(`PRAGMA user_version = ${marker + index}`);
		const read = database
			.query<{ user_version: number }, []>("PRAGMA user_version")
			.get()?.user_version;
		if (read !== marker + index) misrouted++;
	}
	return { handles, misrouted };
};

if (!isMainThread) {
	const { lock, start, marker } = workerData as {
		lock: SharedArrayBuffer;
		start: SharedArrayBuffer;
		marker: number;
	};
	shareSqliteOpenLock({ lock });
	while (Atomics.load(new Int32Array(start), 0) === 0) {}
	parentPort?.postMessage(openMany({ marker }));
} else if (import.meta.main) {
	const start = new SharedArrayBuffer(4);
	const results = Array.from(
		{ length: WORKERS },
		(_, worker) =>
			new Promise<{ handles: number[]; misrouted: number }>((resolve) => {
				const thread = new Worker(import.meta.path, {
					workerData: {
						lock: getSqliteOpenLock(),
						start,
						marker: worker * 100_000,
					},
				} as never);
				thread.addEventListener("message", (event) => {
					resolve(event.data);
					thread.terminate();
				});
			}),
	);
	await Bun.sleep(200);
	Atomics.store(new Int32Array(start), 0, 1);
	const opened = await Promise.all(results);
	const handles = opened.flatMap(({ handles }) => handles);
	console.log(
		JSON.stringify({
			opened: handles.length,
			distinct: new Set(handles).size,
			misrouted: opened.reduce((sum, { misrouted }) => sum + misrouted, 0),
		}),
	);
}
