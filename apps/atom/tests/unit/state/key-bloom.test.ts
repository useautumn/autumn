import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TrackCommand } from "@autumn/balance-engine";
import {
	createState,
	createTrackCommand,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import * as keyBloom from "../../../src/state/journal/keyBloom.js";
import { openJournal } from "../../../src/state/journal/openJournal.js";
import type { Journal } from "../../../src/state/journal/types/journal.js";
import * as journalKeys from "../../../src/state/repos/journalKeys.js";

const MINUTE_MS = 60_000;
const WINDOW_MS = keyBloom.BLOOM_WINDOW_MS;

const folders: string[] = [];
const journals: Journal[] = [];
const spies: { mockRestore(): void }[] = [];
const openAt = ({
	clock,
	folder = mkdtempSync(join(tmpdir(), "atom-key-bloom-")),
}: {
	clock: () => number;
	folder?: string;
}) => {
	folders.push(folder);
	const journal = openJournal({
		databasePath: join(folder, "journal-000-of-001.sqlite"),
		now: clock,
	});
	journals.push(journal);
	return journal;
};
afterEach(() => {
	for (const spy of spies.splice(0)) spy.mockRestore();
	for (const journal of journals.splice(0)) journal.close();
	for (const folder of folders.splice(0))
		rmSync(folder, { recursive: true, force: true });
});

let commands = 0;
const trackClaiming = ({
	key,
	customerId = "cus_1",
}: {
	key: string | null;
	customerId?: string;
}): TrackCommand => {
	const commandId = `cmd_${++commands}`;
	return {
		...createTrackCommand({
			commandId,
			requestId: `req_${commandId}`,
			overageBehavior: "overflow",
		}),
		identity: { ...createState().identity, customerId },
		idempotency: {
			key: `track:${key ?? `req_${commandId}`}`,
			ttlMs: 24 * 60 * MINUTE_MS,
		},
	};
};

/** A deterministic sequence of appends and key checks: fresh keys, keyless entries and repeats over two customers. */
const randomOps = ({ seed, count }: { seed: number; count: number }) => {
	let state = seed;
	const next = () => {
		state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
		return state / 2 ** 31;
	};
	return Array.from({ length: count }, (_, at) => ({
		customerId: next() < 0.5 ? "cus_1" : "cus_2",
		key: next() < 0.2 ? null : `k_${Math.floor(next() * (at + 1))}`,
	}));
};

/** Takes each key the journal says is new, as deductOnSubject does, and answers what each check said. */
const answersOf = async ({
	journal,
	ops,
}: {
	journal: Journal;
	ops: ReturnType<typeof randomOps>;
}) => {
	const answers: string[] = [];
	for (const { customerId, key } of ops) {
		const claimKey = key && `track:${key}`;
		if (claimKey && journal.holdsKey({ customerId, key: claimKey })) {
			answers.push("409");
			continue;
		}
		await journal.append({
			customerId,
			command: trackClaiming({ key, customerId }),
		});
		answers.push("202");
	}
	return answers;
};

describe("the key filter in front of journal_keys", () => {
	test("every answer with the filter equals the answer without it, and the same entries are owed", async () => {
		const ops = randomOps({ seed: 42, count: 300 });
		const withFilter = openAt({ clock: Date.now });
		const withFilterAnswers = await answersOf({ journal: withFilter, ops });
		const withoutFilter = openAt({ clock: Date.now });
		spies.push(spyOn(keyBloom, "mayHoldKey").mockReturnValue(true));
		const withoutFilterAnswers = await answersOf({
			journal: withoutFilter,
			ops,
		});

		expect(withFilterAnswers).toEqual(withoutFilterAnswers);
		expect(withFilterAnswers).toContain("409");
		for (const customerId of ["cus_1", "cus_2"])
			expect(
				withFilter.owed({ customerId }).map(({ command }) => command.type),
			).toEqual(
				withoutFilter.owed({ customerId }).map(({ command }) => command.type),
			);
	});

	test("a definite miss performs no SQLite read", async () => {
		const journal = openAt({ clock: Date.now });
		await journal.append({
			customerId: "cus_1",
			command: trackClaiming({ key: "taken" }),
		});
		const reads = spyOn(journalKeys, "readJournalKey");
		spies.push(reads);

		expect(journal.holdsKey({ customerId: "cus_1", key: "track:fresh" })).toBe(
			false,
		);
		expect(reads).not.toHaveBeenCalled();
		expect(journal.holdsKey({ customerId: "cus_1", key: "track:taken" })).toBe(
			true,
		);
	});

	test("a key added 59 min ago is still held; one added more than 90 min ago is new with or without the filter", async () => {
		let clock = 10 * WINDOW_MS;
		const journal = openAt({ clock: () => clock });
		await journal.append({
			customerId: "cus_1",
			command: trackClaiming({ key: "k" }),
		});

		clock += 59 * MINUTE_MS;
		const heldAt59 = journal.holdsKey({ customerId: "cus_1", key: "track:k" });
		clock += 32 * MINUTE_MS;
		const heldAt91 = journal.holdsKey({ customerId: "cus_1", key: "track:k" });
		spies.push(spyOn(keyBloom, "mayHoldKey").mockReturnValue(true));
		const readAt91 = journal.holdsKey({ customerId: "cus_1", key: "track:k" });

		expect([heldAt59, heldAt91, readAt91]).toEqual([true, false, false]);
	});

	test("rotation drops the oldest window only", () => {
		const keyHash = (key: string) => journalKeys.journalKeyHash({ key });
		const at = (window: number) => 1_000 * WINDOW_MS + window * WINDOW_MS;
		for (const window of [0, 1, 2])
			keyBloom.addKey({
				customerId: "cus_rotation",
				keyHash: keyHash(`k_${window}`),
				now: at(window),
			});

		const held = [0, 1, 2].map((window) =>
			keyBloom.mayHoldKey({
				customerId: "cus_rotation",
				keyHash: keyHash(`k_${window}`),
				now: at(3),
			}),
		);

		expect(held).toEqual([false, true, true]);
	});
});

describe("the key filters after a restart", () => {
	test("a key added 5 min ago is 409, one added 2 h ago is new, and a fresh key reads nothing", async () => {
		let clock = 10 * WINDOW_MS + 7 * MINUTE_MS;
		const folder = mkdtempSync(join(tmpdir(), "atom-key-bloom-"));
		const before = openAt({ clock: () => clock, folder });
		await before.append({
			customerId: "cus_1",
			command: trackClaiming({ key: "two_hours" }),
		});
		clock += 115 * MINUTE_MS;
		await before.append({
			customerId: "cus_1",
			command: trackClaiming({ key: "five_minutes" }),
		});
		clock += 5 * MINUTE_MS;
		before.close();
		journals.splice(journals.indexOf(before), 1);

		// A restarted thread starts with empty filters.
		keyBloom.emptyKeyFilters();
		const after = openAt({ clock: () => clock, folder });
		const reads = spyOn(journalKeys, "readJournalKey");
		spies.push(reads);
		const fresh = after.holdsKey({ customerId: "cus_1", key: "track:fresh" });
		const readsForFresh = reads.mock.calls.length;

		expect({
			fiveMinutes: after.holdsKey({
				customerId: "cus_1",
				key: "track:five_minutes",
			}),
			twoHours: after.holdsKey({ customerId: "cus_1", key: "track:two_hours" }),
			fresh,
			readsForFresh,
		}).toEqual({
			fiveMinutes: true,
			twoHours: false,
			fresh: false,
			readsForFresh: 0,
		});
	});
});
