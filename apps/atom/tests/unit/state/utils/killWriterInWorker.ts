import { isMainThread, parentPort, workerData } from "node:worker_threads";
import {
	createState,
	createTrackCommand,
} from "../../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { openJournal } from "../../../../src/state/journal/openJournal.js";
import { shareSqliteOpenLock } from "../../../../src/state/newSqliteConnection.js";
import { terminateSqliteWriter } from "../../../../src/state/writer/getSqliteWriter.js";

/** Run as a serving thread: commits one append, then loses its writer with a second in flight, and says how that one ended. */
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
	const journal = openJournal({ databasePath: path });
	await journal.append({
		customerId: "cus_1",
		command: commandOf({ commandId: "first" }),
	});
	parentPort?.postMessage("first committed");
	const second = journal.append({
		customerId: "cus_1",
		command: commandOf({ commandId: "second" }),
	});
	terminateSqliteWriter();
	second.then(
		() => parentPort?.postMessage("second acknowledged"),
		(error: Error) => parentPort?.postMessage(`second failed: ${error.message}`),
	);
}
