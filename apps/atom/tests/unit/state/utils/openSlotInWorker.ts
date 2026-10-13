import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { openSlotDatabase } from "../../../../src/state/openSlotDatabase.js";

/** Run as a worker: opens the file once every opener has started, and reports how it went. */
export const OPENER_PATH = import.meta.path;

if (!isMainThread) {
	const { path, start, threads } = workerData as {
		path: string;
		start: SharedArrayBuffer;
		threads: number;
	};
	const arrived = new Int32Array(start);
	Atomics.add(arrived, 0, 1);
	while (Atomics.load(arrived, 0) < threads) {}
	try {
		openSlotDatabase({ databasePath: path }).close();
		parentPort?.postMessage("ok");
	} catch (error) {
		parentPort?.postMessage(
			`${(error as Error).name}: ${(error as Error).message}`,
		);
	}
}
