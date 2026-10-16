import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createState,
	createTrackCommand,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { openJournal } from "../../../src/state/journal/openJournal.js";
import { getSqliteOpenLock } from "../../../src/state/newSqliteConnection.js";
import { openSqliteStore } from "../../../src/state/openSqliteStore.js";
import { readSqliteWriterThreadStats } from "../../../src/state/writer/getSqliteWriter.js";
import { atomOrg, freshHeld } from "../utils/atomFixtures.js";
import { KILL_WRITER_PATH } from "./utils/killWriterInWorker.js";

const folders: string[] = [];
const pathIn = (name: string) => {
	const folder = mkdtempSync(join(tmpdir(), "atom-writer-"));
	folders.push(folder);
	return join(folder, name);
};
afterEach(() => {
	for (const folder of folders.splice(0))
		rmSync(folder, { recursive: true, force: true });
});

const subject = {
	state: createState(),
	catalog: {
		entitlements: {},
		products: {},
		features: {},
		prices: {},
		planLicenses: {},
		freeTrials: {},
	},
	org: atomOrg,
	logOffset: 7n,
	readAt: 1700,
	customerVersion: 0n,
};

describe("the SQLite writer thread", () => {
	test("a write acknowledged by the writer thread is visible to the serving thread's next read", async () => {
		const store = openSqliteStore({
			databasePath: pathIn("slot-000.sqlite"),
			held: freshHeld(),
		});
		const roundTrips = readSqliteWriterThreadStats().sqliteWriterRoundTrips;

		expect(await store.setSubject({ subject })).toBe(true);

		expect(readSqliteWriterThreadStats().sqliteWriterRoundTrips).toBe(
			roundTrips + 1,
		);
		expect(
			store
				.listAppliedAfter({ after: null, cursor: null, limit: 10 })
				.map((applied) => applied.subject),
		).toEqual([subject]);
		store.close();
	});

	test("a journal append resolves only once the writer thread has committed it to the file", async () => {
		const databasePath = pathIn("journal-000-of-001.sqlite");
		const journal = openJournal({ databasePath });

		await journal.append({
			customerId: subject.state.identity.customerId,
			command: {
				...createTrackCommand({ commandId: "c1", value: 1 }),
				identity: subject.state.identity,
			},
		});

		const database = new Database(databasePath, { readonly: true });
		expect(
			database
				.query<{ seq: number }, []>("SELECT seq FROM journal_entries")
				.all(),
		).toEqual([{ seq: 1 }]);
		database.close();
		journal.close();
	});

	test("a drop is committed by the writer thread before it resolves, and the serving thread's next count sees it", async () => {
		const databasePath = pathIn("slot-000.sqlite");
		const store = openSqliteStore({ databasePath, held: freshHeld() });
		await store.setSubject({ subject });

		const dropped = await store.dropCustomersWrittenBefore({
			before: Date.now() + 1,
			limit: 10,
		});

		expect(dropped).toEqual({ customers: 1, rows: 1 });
		expect(store.countSubjects()).toBe(0);
		store.close();
	});

	test("a dead writer fails the pending writes and the thread", async () => {
		const thread = new Worker(KILL_WRITER_PATH, {
			workerData: {
				path: pathIn("journal-000-of-001.sqlite"),
				lock: getSqliteOpenLock(),
			},
		} as never);
		const said: string[] = [];
		thread.addEventListener("message", (event) => said.push(event.data));
		const exitCode = await new Promise<number>((resolve) =>
			thread.addEventListener("close", (event) =>
				resolve((event as CloseEvent).code),
			),
		);

		expect(said).toEqual([
			"first committed",
			"second failed: The SQLite writer thread died",
		]);
		expect(exitCode).toBe(1);
	});
});
