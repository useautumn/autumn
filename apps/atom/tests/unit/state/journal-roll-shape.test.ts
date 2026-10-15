import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TrackCommand } from "@autumn/balance-engine";
import {
	createState,
	createTrackCommand,
	org,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { openJournal } from "../../../src/state/journal/openJournal.js";
import type { Journal } from "../../../src/state/journal/types/journal.js";

const folders: string[] = [];
const journals: Journal[] = [];
afterEach(() => {
	for (const journal of journals.splice(0)) journal.close();
	for (const folder of folders.splice(0))
		rmSync(folder, { recursive: true, force: true });
});

const commandOf = ({
	commandId,
	customerId,
}: {
	commandId: string;
	customerId: string;
}): TrackCommand => ({
	...createTrackCommand({ commandId, value: 1, overageBehavior: "overflow" }),
	identity: { ...createState().identity, customerId },
	org,
});

/** A file as the rolling-handover build leaves it: entries keyed by (customer, writer, seq), a peer's among them. */
const rollShapedFile = () => {
	const folder = mkdtempSync(join(tmpdir(), "atom-journal-roll-"));
	folders.push(folder);
	const path = join(folder, "journal-000-of-001.sqlite");
	const database = new Database(path, { create: true, strict: true });
	database.run("PRAGMA journal_mode = WAL");
	database.run(`CREATE TABLE journal_entries (
		customer_id TEXT NOT NULL, writer_id TEXT NOT NULL, seq INTEGER NOT NULL CHECK (seq > 0),
		appended_at INTEGER NOT NULL, command_json TEXT NOT NULL, PRIMARY KEY (customer_id, writer_id, seq)
	) WITHOUT ROWID`);
	database.run(
		"CREATE TABLE journal_seqs (customer_id TEXT PRIMARY KEY, last_seq INTEGER NOT NULL CHECK (last_seq > 0)) WITHOUT ROWID",
	);
	database.run(
		"CREATE TABLE journal_meta (id INTEGER PRIMARY KEY CHECK (id = 1), writer_id TEXT NOT NULL)",
	);
	database.run("INSERT INTO journal_meta (id, writer_id) VALUES (1, 'own')");
	const insert = database.query(
		"INSERT INTO journal_entries VALUES ($customerId, $writerId, $seq, $appendedAt, $commandJson)",
	);
	const rows = [
		["cus_1", "own", 1, 10, "o1"],
		["cus_1", "own", 2, 20, "o2"],
		["cus_1", "peer", 2, 15, "p2"],
		["cus_2", "peer", 7, 30, "p7"],
	] as const;
	for (const [customerId, writerId, seq, appendedAt, commandId] of rows)
		insert.run({
			customerId,
			writerId,
			seq,
			appendedAt,
			commandJson: JSON.stringify(commandOf({ commandId, customerId })),
		});
	database.run("INSERT INTO journal_seqs VALUES ('cus_1', 2)");
	database.run("PRAGMA user_version = 1");
	database.close();
	return path;
};

test("a file the rolling-handover build reshaped takes appends again, every entry it held owed once under its own seq", async () => {
	const databasePath = rollShapedFile();
	const journal = openJournal({ databasePath });
	journals.push(journal);

	await journal.append({
		customerId: "cus_1",
		command: commandOf({ commandId: "n1", customerId: "cus_1" }),
	});

	const owed = (customerId: string) =>
		journal
			.owed({ customerId })
			.map(({ seq, command }) => [seq, command.commandId]);
	expect(owed("cus_1")).toEqual([
		[1, "o1"],
		[2, "o2"],
		[3, "p2"],
		[4, "n1"],
	]);
	expect(owed("cus_2")).toEqual([[1, "p7"]]);
});
