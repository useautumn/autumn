import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TrackCommand } from "@autumn/balance-engine";
import {
	createState,
	createTrackCommand,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import {
	KEY_ROW_TTL_MS,
	openJournal,
} from "../../../src/state/journal/openJournal.js";
import type { Journal } from "../../../src/state/journal/types/journal.js";

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
	for (const journal of journals.splice(0)) journal.close();
	for (const folder of folders.splice(0))
		rmSync(folder, { recursive: true, force: true });
});

/** A track as the Atom journals it: keyed by the caller (`track:<K>`), or under its own request id when `key` is null. */
const keyedCommand = ({
	commandId,
	key,
	customerId = "cus_1",
}: {
	commandId: string;
	key: string | null;
	customerId?: string;
}): TrackCommand => {
	const command = createTrackCommand({
		commandId,
		requestId: `req_${commandId}`,
		overageBehavior: "overflow",
	});
	return {
		...command,
		identity: { ...createState().identity, customerId },
		idempotency: {
			key: key === null ? `track:req_${commandId}` : `track:${key}`,
			ttlMs: 86_400_000,
		},
	};
};

const keyRowsIn = ({ databasePath }: { databasePath: string }) => {
	const database = new Database(databasePath, { readonly: true });
	try {
		return database
			.query<{ customerId: string }, []>(
				"SELECT customer_id AS customerId FROM journal_keys ORDER BY customer_id",
			)
			.all();
	} finally {
		database.close();
	}
};

describe("journal keys", () => {
	test("a caller-keyed track's key row lands with its entry; a failed commit leaves neither, and the key free", async () => {
		const databasePath = journalPath();
		const journal = open({ databasePath });
		const unwritable = {
			...keyedCommand({ commandId: "b", key: "k_b" }),
			properties: { amount: 1n },
		} as unknown as TrackCommand;

		await journal.append({
			customerId: "cus_1",
			command: keyedCommand({ commandId: "a", key: "k_a" }),
		});
		await expect(
			journal.append({ customerId: "cus_1", command: unwritable }),
		).rejects.toThrow();

		expect(keyRowsIn({ databasePath })).toEqual([{ customerId: "cus_1" }]);
		expect(journal.holdsKey({ customerId: "cus_1", key: "track:k_a" })).toBe(
			true,
		);
		expect(journal.holdsKey({ customerId: "cus_1", key: "track:k_b" })).toBe(
			false,
		);
	});

	test("an Atom-own key stores no row", async () => {
		const databasePath = journalPath();
		const journal = open({ databasePath });

		await journal.append({
			customerId: "cus_1",
			command: keyedCommand({ commandId: "a", key: null }),
		});

		expect(keyRowsIn({ databasePath })).toEqual([]);
	});

	test("a key is held from its append, before its commit lands", async () => {
		const journal = open({ databasePath: journalPath() });

		const appended = journal.append({
			customerId: "cus_1",
			command: keyedCommand({ commandId: "a", key: "k" }),
		});

		expect(journal.holdsKey({ customerId: "cus_1", key: "track:k" })).toBe(
			true,
		);
		await appended;
	});

	test("a key is per customer: another customer's is new", async () => {
		const journal = open({ databasePath: journalPath() });

		await journal.append({
			customerId: "cus_1",
			command: keyedCommand({ commandId: "a", key: "k" }),
		});

		expect(journal.holdsKey({ customerId: "cus_2", key: "track:k" })).toBe(
			false,
		);
	});

	test("a row older than 90 min is new and pruned; a younger one is kept", async () => {
		const databasePath = journalPath();
		let clock = 1_000_000_000;
		const journal = open({ databasePath, now: () => clock });

		await journal.append({
			customerId: "cus_1",
			command: keyedCommand({ commandId: "old", key: "k_old" }),
		});
		clock += KEY_ROW_TTL_MS - 60_000;
		await journal.append({
			customerId: "cus_2",
			command: keyedCommand({
				commandId: "young",
				key: "k_young",
				customerId: "cus_2",
			}),
		});
		clock += 60_001;

		expect(journal.holdsKey({ customerId: "cus_1", key: "track:k_old" })).toBe(
			false,
		);
		expect(await journal.pruneKeys()).toMatchObject({ rows: 1 });
		expect(keyRowsIn({ databasePath })).toEqual([{ customerId: "cus_2" }]);
		expect(
			journal.holdsKey({ customerId: "cus_2", key: "track:k_young" }),
		).toBe(true);
	});

	test("a file from before the table gains it on open and keeps its owed entries", async () => {
		const databasePath = journalPath();
		const before = open({ databasePath });
		await before.append({
			customerId: "cus_1",
			command: keyedCommand({ commandId: "a", key: null }),
		});
		before.close();
		journals.splice(journals.indexOf(before), 1);
		const database = new Database(databasePath);
		database.run("DROP TABLE journal_keys");
		database.close();

		const reopened = open({ databasePath });

		expect(reopened.owed({ customerId: "cus_1" })).toHaveLength(1);
		await reopened.append({
			customerId: "cus_1",
			command: keyedCommand({ commandId: "b", key: "k" }),
		});
		expect(reopened.holdsKey({ customerId: "cus_1", key: "track:k" })).toBe(
			true,
		);
	});

	test("forget drops the customer's key rows", async () => {
		const databasePath = journalPath();
		const journal = open({ databasePath });
		await journal.append({
			customerId: "cus_1",
			command: keyedCommand({ commandId: "a", key: "k" }),
		});

		await journal.forget({ customerId: "cus_1" });

		expect(keyRowsIn({ databasePath })).toEqual([]);
		expect(journal.holdsKey({ customerId: "cus_1", key: "track:k" })).toBe(
			false,
		);
	});
});
