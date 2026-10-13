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
import { openJournalDatabase } from "../../../src/state/journal/openJournalDatabase.js";
import type { Journal } from "../../../src/state/journal/types/journal.js";
import { storedSubjectWith } from "../utils/atomFixtures.js";

const folders: string[] = [];
const journals: Journal[] = [];
const journalPath = () => {
	const folder = mkdtempSync(join(tmpdir(), "atom-journal-"));
	folders.push(folder);
	return join(folder, "journal-000-of-001.sqlite");
};
const open = (params: Parameters<typeof openJournal>[0]) => {
	const journal = openJournal(params);
	journals.push(journal);
	return journal;
};
afterEach(() => {
	for (const journal of journals.splice(0)) journal.close();
	for (const folder of folders.splice(0))
		rmSync(folder, { recursive: true, force: true });
});

const commandOf = ({
	commandId,
	value = 10,
	customerId = "cus_1",
}: {
	commandId: string;
	value?: number;
	customerId?: string;
}) => ({
	...createTrackCommand({ commandId, value, overageBehavior: "overflow" }),
	identity: { ...createState().identity, customerId },
});

const rowsIn = ({ databasePath }: { databasePath: string }) => {
	const database = new Database(databasePath, { readonly: true });
	try {
		return database
			.query<{ customerId: string; seq: number; status: string }, []>(
				"SELECT customer_id AS customerId, seq, status FROM journal_entries ORDER BY customer_id, seq",
			)
			.all();
	} finally {
		database.close();
	}
};

describe("journal", () => {
	test("the file commits with synchronous = FULL: an acked deduction survives a power cut", () => {
		const database = openJournalDatabase({ databasePath: journalPath() });
		try {
			const { synchronous } = database
				.query<{ synchronous: bigint }, []>("PRAGMA synchronous")
				.get() ?? { synchronous: -1n };
			expect(synchronous).toBe(2n);
		} finally {
			database.close();
		}
	});

	test("seq is per customer and strictly increasing, in the order appends arrive", async () => {
		const journal = open({ databasePath: journalPath() });

		const entries = await Promise.all([
			journal.append({
				customerId: "cus_1",
				command: commandOf({ commandId: "a" }),
			}),
			journal.append({
				customerId: "cus_2",
				command: commandOf({ commandId: "b", customerId: "cus_2" }),
			}),
			journal.append({
				customerId: "cus_1",
				command: commandOf({ commandId: "c" }),
			}),
		]);

		expect(
			entries.map(({ customerId, seq, command }) => [
				customerId,
				seq,
				command.commandId,
			]),
		).toEqual([
			["cus_1", 1, "a"],
			["cus_2", 1, "b"],
			["cus_1", 2, "c"],
		]);
		expect(journal.owed({ customerId: "cus_1" }).map(({ seq }) => seq)).toEqual(
			[1, 2],
		);
	});

	test("an entry is owed from the moment it is appended, before its commit lands", async () => {
		const journal = open({ databasePath: journalPath() });

		const append = journal.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "a" }),
		});

		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(1);
		await append;
	});

	test("restart: pending rows survive a reopen, as the worker's own commands", async () => {
		const databasePath = journalPath();
		const first = openJournal({ databasePath });
		const command = commandOf({ commandId: "a" });
		await first.append({ customerId: "cus_1", command });
		first.close();

		const reopened = open({ databasePath });

		expect(reopened.owed({ customerId: "cus_1" })).toEqual([
			{ customerId: "cus_1", seq: 1, status: { kind: "pending" }, command },
		]);
	});

	test("atomic append: a throw after the journal commit leaves exactly one row", async () => {
		const databasePath = journalPath();
		const journal = open({ databasePath });

		const appendThenFail = async () => {
			await journal.append({
				customerId: "cus_1",
				command: commandOf({ commandId: "a" }),
			});
			throw new Error("the caller failed after its ack");
		};

		await expect(appendThenFail()).rejects.toThrow("after its ack");
		expect(rowsIn({ databasePath })).toEqual([
			{ customerId: "cus_1", seq: 1, status: "pending" },
		]);
	});

	test("atomic append: a throw before the commit leaves none, for every append in its batch", async () => {
		const databasePath = journalPath();
		const journal = open({ databasePath });
		// Properties that cannot be written as JSON fail the commit part-way through its batch.
		const unwritable = {
			...commandOf({ commandId: "b" }),
			properties: { amount: 1n },
		};

		const settled = await Promise.allSettled([
			journal.append({
				customerId: "cus_1",
				command: commandOf({ commandId: "a" }),
			}),
			journal.append({ customerId: "cus_1", command: unwritable }),
		]);

		expect(settled.map(({ status }) => status)).toEqual([
			"rejected",
			"rejected",
		]);
		expect(rowsIn({ databasePath })).toEqual([]);
		expect(journal.owed({ customerId: "cus_1" })).toEqual([]);
	});

	test("a rejected entry is no longer owed, and stays refused after a reopen", async () => {
		const databasePath = journalPath();
		const journal = openJournal({ databasePath });
		await journal.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "a" }),
		});
		await journal.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "b" }),
		});

		journal.setStatus({
			customerId: "cus_1",
			seq: 1,
			status: { kind: "rejected", code: "insufficient_balance" },
		});

		expect(journal.owed({ customerId: "cus_1" }).map(({ seq }) => seq)).toEqual(
			[2],
		);
		journal.close();
		expect(
			open({ databasePath })
				.owed({ customerId: "cus_1" })
				.map(({ seq }) => seq),
		).toEqual([2]);
	});

	test("owed is the same array until the customer's entries change", async () => {
		const journal = open({ databasePath: journalPath() });

		const empty = journal.owed({ customerId: "cus_1" });
		expect(journal.owed({ customerId: "cus_1" })).toBe(empty);
		expect(journal.owed({ customerId: "cus_2" })).toBe(empty);

		await journal.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "a" }),
		});
		const one = journal.owed({ customerId: "cus_1" });
		expect(one).not.toBe(empty);
		expect(journal.owed({ customerId: "cus_1" })).toBe(one);
	});

	test("the reconcile seam drops what the push has seen, and a dropped seq is never reused", async () => {
		const databasePath = journalPath();
		const journal = open({
			databasePath,
			seenBy: ({ owed }) => owed.map(({ seq }) => seq),
		});
		await journal.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "a" }),
		});

		journal.reconcile({
			customerId: "cus_1",
			subject: storedSubjectWith({ balance: 890 }),
		});
		const next = await journal.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "b" }),
		});

		expect(next.seq).toBe(2);
		expect(rowsIn({ databasePath })).toEqual([
			{ customerId: "cus_1", seq: 2, status: "pending" },
		]);
	});

	test("until PR 2's drop rule, a push leaves every entry owed", async () => {
		const journal = open({ databasePath: journalPath() });
		await journal.append({
			customerId: "cus_1",
			command: commandOf({ commandId: "a" }),
		});

		journal.reconcile({
			customerId: "cus_1",
			subject: storedSubjectWith({ balance: 890 }),
		});

		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(1);
	});
});
