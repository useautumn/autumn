import { Database } from "bun:sqlite";
import { afterEach, describe, expect, jest, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FinalizeCommand, TrackCommand } from "@autumn/balance-engine";
import {
	createState,
	createTrackCommand,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { openJournal } from "../../../src/state/journal/openJournal.js";
import type { Journal } from "../../../src/state/journal/types/journal.js";
import { SQLITE_WRITES } from "../../../src/state/writer/sqliteWrites.js";
import { settleSqliteWrites } from "../utils/sqliteWriterTesting.js";

const MINUTE_MS = 60_000;

const folders: string[] = [];
const journals: Journal[] = [];
const journalPath = () => {
	const folder = mkdtempSync(join(tmpdir(), "atom-journal-keys-"));
	folders.push(folder);
	return join(folder, "journal-000-of-001.sqlite");
};
const open = (params: Parameters<typeof openJournal>[0]) => {
	const journal = openJournal(params);
	journals.push(journal);
	return journal;
};
afterEach(() => {
	jest.useRealTimers();
	for (const journal of journals.splice(0)) journal.close();
	for (const folder of folders.splice(0))
		rmSync(folder, { recursive: true, force: true });
});

/** A track as the Atom journals one: claiming the caller's `track:<key>`, or nothing when `key` is null. */
const trackClaiming = ({
	commandId,
	key,
	customerId = "cus_1",
}: {
	commandId: string;
	key: string | null;
	customerId?: string;
}): TrackCommand => ({
	...createTrackCommand({
		commandId,
		requestId: `req_${commandId}`,
		overageBehavior: "overflow",
	}),
	identity: { ...createState().identity, customerId },
	...(key !== null && {
		idempotency: { key: `track:${key}`, ttlMs: 24 * 60 * MINUTE_MS },
	}),
});

const keyRowsIn = ({ databasePath }: { databasePath: string }) => {
	const database = new Database(databasePath, { readonly: true });
	try {
		return database
			.query<{ customerId: string; appendedAt: number }, []>(
				"SELECT customer_id AS customerId, appended_at AS appendedAt FROM journal_keys ORDER BY appended_at",
			)
			.all();
	} finally {
		database.close();
	}
};

describe("journal keys", () => {
	test("a caller-keyed track's key row is in the same transaction as its entry: a failed commit leaves neither", async () => {
		const databasePath = journalPath();
		const journal = open({ databasePath, now: () => 1_000 });
		// Properties that cannot be written as JSON fail the second commit part-way through.
		const unwritable = {
			...trackClaiming({ commandId: "b", key: "k_b" }),
			properties: { amount: 1n },
		} as unknown as TrackCommand;

		await journal.append({
			customerId: "cus_1",
			command: trackClaiming({ commandId: "a", key: "k_a" }),
		});
		await expect(
			journal.append({ customerId: "cus_1", command: unwritable }),
		).rejects.toThrow();

		expect(keyRowsIn({ databasePath })).toEqual([
			{ customerId: "cus_1", appendedAt: 1_000 },
		]);
		expect(journal.owed({ customerId: "cus_1" })).toHaveLength(1);
	});

	test("a keyless track and a finalize store no row", async () => {
		const databasePath = journalPath();
		const journal = open({ databasePath });
		const finalize = {
			...trackClaiming({ commandId: "f", key: "k_f" }),
			type: "finalize",
		} as unknown as FinalizeCommand;

		await journal.append({
			customerId: "cus_1",
			command: trackClaiming({ commandId: "a", key: null }),
		});
		await journal.append({ customerId: "cus_1", command: finalize });

		expect(keyRowsIn({ databasePath })).toEqual([]);
	});

	test("every minute a row older than 90 min is pruned, a younger one kept", async () => {
		const databasePath = journalPath();
		let clock = 0;
		const writing = openJournal({ databasePath, now: () => clock });
		await writing.append({
			customerId: "cus_1",
			command: trackClaiming({ commandId: "old", key: "k_old" }),
		});
		clock = 30 * MINUTE_MS;
		await writing.append({
			customerId: "cus_2",
			command: trackClaiming({
				commandId: "young",
				key: "k_young",
				customerId: "cus_2",
			}),
		});
		writing.close();
		jest.useFakeTimers();
		clock = 90 * MINUTE_MS + 1;
		open({ databasePath, now: () => clock });

		jest.advanceTimersByTime(MINUTE_MS);
		jest.useRealTimers();
		await settleSqliteWrites();

		expect(keyRowsIn({ databasePath })).toEqual([
			{ customerId: "cus_2", appendedAt: 30 * MINUTE_MS },
		]);
	});

	test("a file from before the table gains it on open and keeps its owed entries", async () => {
		const databasePath = journalPath();
		const before = openJournal({ databasePath });
		await before.append({
			customerId: "cus_1",
			command: trackClaiming({ commandId: "a", key: null }),
		});
		before.close();
		const database = new Database(databasePath);
		database.run("DROP TABLE journal_keys");
		database.close();

		const reopened = open({ databasePath });
		await reopened.append({
			customerId: "cus_1",
			command: trackClaiming({ commandId: "b", key: "k_b" }),
		});

		expect(reopened.owed({ customerId: "cus_1" })).toHaveLength(2);
		expect(keyRowsIn({ databasePath })).toHaveLength(1);
	});

	test("forget drops the customer's key rows and leaves others'", async () => {
		const databasePath = journalPath();
		const journal = open({ databasePath, now: () => 1_000 });
		await journal.append({
			customerId: "cus_1",
			command: trackClaiming({ commandId: "a", key: "k" }),
		});
		await journal.append({
			customerId: "cus_2",
			command: trackClaiming({ commandId: "b", key: "k", customerId: "cus_2" }),
		});

		await journal.forget({ customerId: "cus_1" });

		expect(keyRowsIn({ databasePath })).toEqual([
			{ customerId: "cus_2", appendedAt: 1_000 },
		]);
	});
});

/** Lets the prune loop take its turn after a timer fires: its continuation is a microtask, never a timer. */
const flushMicrotasks = async () => {
	for (let i = 0; i < 8; i++) await Promise.resolve();
};

/** The in-memory journal writes inline, so the prune's statement can be held open like a writer that never answers. */
const holdPruneOpen = () => {
	const prune = spyOn(SQLITE_WRITES, "pruneJournalKeys").mockImplementation(
		() => new Promise<string>(() => {}) as unknown as string,
	);
	return {
		calls: () => prune.mock.calls.length,
		restore: () => prune.mockRestore(),
	};
};

describe("the key prune loop", () => {
	test("a prune the writer never answers is the only one in flight, however many minutes pass", async () => {
		const held = holdPruneOpen();
		try {
			jest.useFakeTimers();
			open({ databasePath: ":memory:" });
			for (let minute = 1; minute <= 5; minute++) {
				jest.advanceTimersByTime(MINUTE_MS);
				await flushMicrotasks();
			}
			expect(held.calls()).toBe(1);
		} finally {
			held.restore();
		}
	});

	test("close ends the loop: no prune starts after it", async () => {
		const held = holdPruneOpen();
		try {
			jest.useFakeTimers();
			const journal = open({ databasePath: ":memory:" });
			journal.close();
			journals.splice(journals.indexOf(journal), 1);
			for (let minute = 1; minute <= 3; minute++) {
				jest.advanceTimersByTime(MINUTE_MS);
				await flushMicrotasks();
			}
			expect(held.calls()).toBe(0);
		} finally {
			held.restore();
		}
	});
});
