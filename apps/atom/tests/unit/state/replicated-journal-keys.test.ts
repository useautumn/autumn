import { Database } from "bun:sqlite";
import { afterEach, describe, expect, jest, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FinalizeCommand, TrackCommand } from "@autumn/balance-engine";
import {
	createState,
	createTrackCommand,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { openJournal } from "../../../src/state/journal/openJournal.js";
import type {
	Journal,
	JournalKeyRow,
} from "../../../src/state/journal/types/journal.js";
import { journalKeyHash } from "../../../src/state/repos/journalKeys.js";
import { settleSqliteWrites } from "../utils/sqliteWriterTesting.js";

const MINUTE_MS = 60_000;

const folders: string[] = [];
const journals: Journal[] = [];
const journalPath = () => {
	const folder = mkdtempSync(join(tmpdir(), "atom-replicated-keys-"));
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

const keyedTrack = ({
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

/** A key row as another replica relays it: the claim's hash as hex. */
const relayedKey = ({
	key,
	appendedAt,
	customerId = "cus_1",
}: {
	key: string;
	appendedAt: number;
	customerId?: string;
}): JournalKeyRow => ({
	customerId,
	keyHash: Buffer.from(journalKeyHash({ key: `track:${key}` })).toString("hex"),
	appendedAt,
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

describe("a journal's committed idempotency keys", () => {
	test("are passed on once committed, as the rows they wrote; a keyless track, a finalize and a failed commit pass nothing", async () => {
		const committed: JournalKeyRow[][] = [];
		const journal = open({
			databasePath: journalPath(),
			now: () => 1_000,
			onKeysCommitted: (keys) => committed.push(keys),
		});
		const unwritable = {
			...keyedTrack({ commandId: "bad", key: "k_bad" }),
			properties: { amount: 1n },
		} as unknown as TrackCommand;
		const finalize = {
			...keyedTrack({ commandId: "f", key: "k_f" }),
			type: "finalize",
		} as unknown as FinalizeCommand;

		await journal.append({
			customerId: "cus_1",
			command: keyedTrack({ commandId: "a", key: "k_a" }),
		});
		await journal.append({
			customerId: "cus_1",
			command: keyedTrack({ commandId: "b", key: null }),
		});
		await journal.append({ customerId: "cus_1", command: finalize });
		await expect(
			journal.append({ customerId: "cus_1", command: unwritable }),
		).rejects.toThrow();

		expect(committed).toEqual([
			[relayedKey({ key: "k_a", appendedAt: 1_000 })],
		]);
	});
});

describe("idempotency keys another replica relayed", () => {
	test("are held: the key is a duplicate here from the moment they land", async () => {
		const journal = open({ databasePath: journalPath(), now: () => 5_000 });

		expect(
			await journal.receiveKeys({
				keys: [relayedKey({ key: "k_1", appendedAt: 4_000 })],
			}),
		).toBe(1);

		expect(journal.holdsKey({ customerId: "cus_1", key: "track:k_1" })).toBe(
			true,
		);
		expect(journal.holdsKey({ customerId: "cus_2", key: "track:k_1" })).toBe(
			false,
		);
	});

	test("received twice, by a replayed relay or a relay and a catch-up, leave one row: the first one", async () => {
		const databasePath = journalPath();
		const journal = open({ databasePath, now: () => 5_000 });

		await journal.receiveKeys({
			keys: [relayedKey({ key: "k_1", appendedAt: 4_000 })],
		});
		const again = await journal.receiveKeys({
			keys: [
				relayedKey({ key: "k_1", appendedAt: 4_500 }),
				relayedKey({ key: "k_2", appendedAt: 4_600 }),
			],
		});

		expect(again).toBe(1);
		expect(keyRowsIn({ databasePath })).toEqual([
			{ customerId: "cus_1", appendedAt: 4_000 },
			{ customerId: "cus_1", appendedAt: 4_600 },
		]);
	});

	test("a key this journal took itself keeps its own row", async () => {
		const databasePath = journalPath();
		const journal = open({ databasePath, now: () => 1_000 });
		await journal.append({
			customerId: "cus_1",
			command: keyedTrack({ commandId: "a", key: "k_1" }),
		});

		expect(
			await journal.receiveKeys({
				keys: [relayedKey({ key: "k_1", appendedAt: 900 })],
			}),
		).toBe(0);

		expect(keyRowsIn({ databasePath })).toEqual([
			{ customerId: "cus_1", appendedAt: 1_000 },
		]);
	});

	test("are pruned like the journal's own once older than 90 min: a younger one is kept", async () => {
		const databasePath = journalPath();
		let clock = 90 * MINUTE_MS;
		const receiving = openJournal({ databasePath, now: () => clock });
		await receiving.receiveKeys({
			keys: [
				relayedKey({ key: "k_old", appendedAt: 0 }),
				relayedKey({
					key: "k_young",
					appendedAt: 30 * MINUTE_MS,
					customerId: "cus_2",
				}),
			],
		});
		receiving.close();
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
});

describe("a journal's recent idempotency keys, as a booting peer copies them", () => {
	test("are the rows of the last 90 min, oldest first, a page at a time past the last row read", async () => {
		const journal = open({
			databasePath: journalPath(),
			now: () => 100 * MINUTE_MS,
		});
		const old = relayedKey({ key: "k_old", appendedAt: 9 * MINUTE_MS });
		const recent = [
			relayedKey({ key: "k_1", appendedAt: 11 * MINUTE_MS }),
			relayedKey({ key: "k_2", appendedAt: 50 * MINUTE_MS }),
			relayedKey({ key: "k_3", appendedAt: 99 * MINUTE_MS }),
		];
		await journal.receiveKeys({ keys: [old, ...recent] });

		const first = journal.recentKeys({ after: null, limit: 2 });
		const second = journal.recentKeys({
			after: first.at(-1) ?? null,
			limit: 2,
		});

		expect(first).toEqual(recent.slice(0, 2));
		expect(second).toEqual(recent.slice(2));
	});

	test("rows taken in the same millisecond page past each other, none read twice or skipped", async () => {
		const journal = open({ databasePath: journalPath(), now: () => 1_000 });
		const keys = ["a", "b", "c", "d", "e"].map((key) =>
			relayedKey({ key, appendedAt: 1_000 }),
		);
		await journal.receiveKeys({ keys });

		const read: JournalKeyRow[] = [];
		let after: JournalKeyRow | null = null;
		for (;;) {
			const page = journal.recentKeys({ after, limit: 2 });
			read.push(...page);
			after = page.at(-1) ?? null;
			if (page.length < 2) break;
		}

		expect(read).toHaveLength(5);
		expect(new Set(read.map(({ keyHash }) => keyHash))).toEqual(
			new Set(keys.map(({ keyHash }) => keyHash)),
		);
	});
});
