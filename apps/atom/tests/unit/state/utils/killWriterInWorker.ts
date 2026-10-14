import { isMainThread, parentPort, workerData } from "node:worker_threads";
import {
	createState,
	createTrackCommand,
} from "../../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { openJournal } from "../../../../src/state/journal/openJournal.js";
import {
	newSqliteConnection,
	shareSqliteOpenLock,
} from "../../../../src/state/newSqliteConnection.js";
import { holdSqliteWriter } from "../../utils/sqliteWriterTesting.js";

/** Run as a serving thread: commits one append, then loses its writer with a second posted to it, and says how that one ended. */
export const KILL_WRITER_PATH = import.meta.path;

const commandOf = ({ commandId }: { commandId: string }) => ({
	...createTrackCommand({ commandId, value: 1, overageBehavior: "overflow" }),
	identity: { ...createState().identity, customerId: "cus_1" },
});

if (!isMainThread) {
	const { path, lock } = workerData as {
		path: string;
		lock: SharedArrayBuffer;
	};
	shareSqliteOpenLock({ lock });
	const writer = holdSqliteWriter();
	const journal = openJournal({ databasePath: path });
	await journal.append({
		customerId: "cus_1",
		command: commandOf({ commandId: "first" }),
	});
	parentPort?.postMessage("first committed");
	// Holds the file's write lock, so the writer cannot commit the second append before it is ended.
	const blocker = newSqliteConnection({ path, options: { readwrite: true } });
	blocker.run("BEGIN IMMEDIATE");
	const second = journal.append({
		customerId: "cus_1",
		command: commandOf({ commandId: "second" }),
	});
	second.then(
		() => parentPort?.postMessage("second acknowledged"),
		(error: Error) =>
			parentPort?.postMessage(`second failed: ${error.message}`),
	);
	await Bun.sleep(50);
	writer.terminate();
	blocker.run("ROLLBACK");
}
