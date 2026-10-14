import { describe, expect, test } from "bun:test";
import type { TrackCommand } from "@autumn/balance-engine";
import { journalEntryToHandIn } from "../../../src/journalForwarder/journalEntryToHandIn.js";
import { owedCommand } from "../utils/journalFixtures.js";

const lock = {
	id: "lck_1",
	lockId: "lock_1",
	expiresAt: 1_800_000_000_000,
	expiryAction: "confirm",
} as const;

/** A track as the Atom journals it: on the caller's overage behaviour. */
const journaled = (
	overrides: Partial<TrackCommand>,
): Parameters<typeof journalEntryToHandIn>[0]["entry"] => ({
	customerId: "cus_1",
	seq: 1,
	appendedAt: 1700,
	command: { ...owedCommand({ commandId: "cmd_1", value: 30 }), ...overrides },
});

const handedIn = (overrides: Partial<TrackCommand>) =>
	journalEntryToHandIn({ writerId: "atom_1", entry: journaled(overrides) });

describe("a lock the Atom granted, handed in to Autumn", () => {
	test("is handed in as granted (overflow), its lock carrying the caller's behaviour for the row", () => {
		for (const callerBehavior of ["reject", "overflow"] as const)
			expect(handedIn({ overageBehavior: callerBehavior, lock })).toMatchObject(
				{
					command: {
						overageBehavior: "overflow",
						lock: { ...lock, callerOverageBehavior: callerBehavior },
					},
				},
			);
	});

	test("a capped lock is handed in capped: the Atom held only what fit", () => {
		expect(handedIn({ overageBehavior: "cap", lock })).toMatchObject({
			command: {
				overageBehavior: "cap",
				lock: { ...lock, callerOverageBehavior: "cap" },
			},
		});
	});

	test("a track without a lock is handed in as journaled", () => {
		const entry = journaled({ overageBehavior: "cap" });
		expect<unknown>(
			journalEntryToHandIn({ writerId: "atom_1", entry }),
		).toEqual({
			writerId: "atom_1",
			seq: 1,
			command: entry.command,
		});
	});
});
