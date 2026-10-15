import { Database } from "bun:sqlite";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAtomLogger } from "../../../src/lib/logging/getAtomLogger.js";
import { openJournal } from "../../../src/state/journal/openJournal.js";
import type { Journal } from "../../../src/state/journal/types/journal.js";
import { owedCommand } from "../utils/journalFixtures.js";

const folders: string[] = [];
const journals: Journal[] = [];
const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	for (const journal of journals.splice(0)) journal.close();
	for (const folder of folders.splice(0))
		rmSync(folder, { recursive: true, force: true });
});

/** A journal file another build reshaped: its entries table wants a column this build never writes, so every insert fails. */
const reshapedJournalPath = () => {
	const folder = mkdtempSync(join(tmpdir(), "atom-journal-reshaped-"));
	folders.push(folder);
	const databasePath = join(folder, "journal-000-of-001.sqlite");
	const first = openJournal({ databasePath });
	first.close();
	const database = new Database(databasePath, { readwrite: true });
	database.run("DROP TABLE journal_entries");
	database.run(`
		CREATE TABLE journal_entries (
			customer_id TEXT NOT NULL,
			writer_id TEXT NOT NULL,
			seq INTEGER NOT NULL CHECK (seq > 0),
			appended_at INTEGER NOT NULL,
			command_json TEXT NOT NULL,
			PRIMARY KEY (customer_id, writer_id, seq)
		) WITHOUT ROWID
	`);
	database.close();
	return databasePath;
};

const errorLines = () => {
	const logged = spyOn(getAtomLogger(), "error").mockImplementation(() => {});
	cleanups.push(() => logged.mockRestore());
	return () =>
		logged.mock.calls
			.map(([fields, message]) => ({
				fields: fields as { type?: string; data?: Record<string, unknown> },
				message: String(message),
			}))
			.filter(({ fields }) => fields.type === "atom_journal_append_failed");
};

describe("a journal that cannot write", () => {
	test("logs the first failed commit with SQLite's reason, then one line per interval with the commits since", async () => {
		// Module state is the thread's own and test files share a thread: start past any line an earlier test logged.
		let at = Date.now() + 60_000;
		const journal = openJournal({
			databasePath: reshapedJournalPath(),
			now: () => at,
		});
		journals.push(journal);
		const append = (i: number) =>
			journal.append({
				customerId: "cus_1",
				command: owedCommand({ commandId: `cmd_${i}`, value: 1 }),
			});
		// An earlier test's failed commits still count toward the next line: one line here clears them.
		await expect(append(0)).rejects.toThrow();
		at += 60_000;
		const lines = errorLines();

		await expect(append(1)).rejects.toThrow(
			"NOT NULL constraint failed: journal_entries.writer_id",
		);
		expect(lines()).toHaveLength(1);
		expect(lines()[0]?.message).toContain(
			"NOT NULL constraint failed: journal_entries.writer_id",
		);
		expect(lines()[0]?.fields.data).toMatchObject({
			entries: 1,
			commitsFailed: 1,
		});

		at += 1_000;
		await expect(append(2)).rejects.toThrow();
		await expect(append(3)).rejects.toThrow();
		expect(lines()).toHaveLength(1);

		at += 10_000;
		await expect(append(4)).rejects.toThrow();
		expect(lines()).toHaveLength(2);
		expect(lines()[1]?.fields.data).toMatchObject({ commitsFailed: 3 });
	});
});
