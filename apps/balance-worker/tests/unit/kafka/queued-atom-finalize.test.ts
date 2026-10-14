/**
 * An Atom's finalize, queued behind its tracks: it names its lock, and the worker settles Autumn's own row.
 *
 *  the lock taken in the same batch → found pending, settled, its row deleted, the seq lands;
 *  the lock taken in an earlier batch → found by the batch's one read, settled;
 *  a lock already settled, or a replayed finalize → nothing moves, the seq lands;
 *  replayed after its lock id was reused, by an id nothing remembers → its seq is held, so the new lock stays open;
 *  a held row whose feature is not the one named → settles nothing, the lock stays open, the seq lands;
 *  a settle lands the seq in its own mutation, one record; a resend inside the writer's window is a duplicate.
 */

import { describe, expect, test } from "bun:test";
import type { TrackCommand } from "@autumn/balance-engine";
import {
	type CommandPipeline,
	createCommandPipeline,
	STARTING_BALANCE,
} from "../../fixtures/commandPipeline.js";
import { testOccurredAt } from "../../fixtures/mutations.js";
import {
	atomFinalizeOf,
	lockingTrackOf,
} from "../../fixtures/queuedCommands.js";

const customerId = "cus_1";

/** The Atom's track opening lock L1 over 10, as journal entry 1. */
const lockTrack: TrackCommand = {
	...lockingTrackOf({ customerId, lockId: "L1", value: 10 }),
	source: { atomId: "atom_1", writerId: "w_1", seq: 1 },
};

const readCustomer = ({ pipeline }: { pipeline: CommandPipeline }) => {
	const state = pipeline.readState({ customerId });
	return {
		balance: state?.customerEntitlements[0]?.balance,
		openLocks: pipeline.storedLockIds(),
		atomSeqs: state?.customer.atom_seqs,
	};
};

const withPipeline = async (
	run: (pipeline: CommandPipeline) => Promise<void>,
) => {
	const pipeline = createCommandPipeline();
	try {
		await run(pipeline);
	} finally {
		await pipeline.close();
	}
};

describe("an Atom's queued finalize", () => {
	test("in the same batch as its lock's track, it finds the lock pending, settles it, deletes its row and lands its seq", () =>
		withPipeline(async (pipeline) => {
			await pipeline.consumeBatch({
				commands: [
					lockTrack,
					atomFinalizeOf({ customerId, lockId: "L1", seq: 2 }),
				],
			});
			await pipeline.drain();

			expect(readCustomer({ pipeline })).toEqual({
				balance: STARTING_BALANCE,
				openLocks: [],
				atomSeqs: { atom_1: { w_1: 2 } },
			});
		}));

	test("settling, it lands its seq in the same mutation: one record in the log, with the lock's delete", () =>
		withPipeline(async (pipeline) => {
			await pipeline.consumeBatch({
				commands: [
					lockTrack,
					atomFinalizeOf({ customerId, lockId: "L1", seq: 2 }),
				],
			});
			await pipeline.drain();

			const records = pipeline.commits
				.flat()
				.filter(({ id }) => id.startsWith("atom_finalize_2"));
			expect(records).toHaveLength(1);
			expect(records[0]?.changes).toEqual(
				expect.arrayContaining([
					{ table: "locks", op: "delete", id: "lck_L1" },
					expect.objectContaining({
						table: "customer",
						after: { atom_seqs: { atom_1: { w_1: 2 } } },
					}),
				]),
			);
		}));

	test("resent inside the writer's window, it is answered as a duplicate of what it decided, never a conflict", () =>
		withPipeline(async (pipeline) => {
			const release = atomFinalizeOf({ customerId, lockId: "L1", seq: 2 });
			await pipeline.consumeBatch({ commands: [lockTrack, release] });
			await pipeline.drain();

			const resent = await pipeline.processor.decideAtomFinalize({
				command: release,
				lock: null,
			});

			expect(await resent.waitForCommit()).toMatchObject({
				kind: "duplicate",
			});
		}));

	test("for a lock taken in an earlier batch, the batch's one read finds it and it settles", () =>
		withPipeline(async (pipeline) => {
			await pipeline.consumeBatch({ commands: [lockTrack] });
			await pipeline.drain();
			await pipeline.consumeBatch({
				commands: [atomFinalizeOf({ customerId, lockId: "L1", seq: 2 })],
				firstOffset: 1,
			});
			await pipeline.drain();

			expect(readCustomer({ pipeline })).toEqual({
				balance: STARTING_BALANCE,
				openLocks: [],
				atomSeqs: { atom_1: { w_1: 2 } },
			});
			expect(pipeline.lockReads).toEqual([["L1"]]);
		}));

	test("for a lock already settled, nothing moves and only its seq lands", () =>
		withPipeline(async (pipeline) => {
			await pipeline.consumeBatch({
				commands: [
					lockTrack,
					atomFinalizeOf({
						customerId,
						lockId: "L1",
						seq: 2,
						finalValue: null,
					}),
					atomFinalizeOf({ customerId, lockId: "L1", seq: 3 }),
				],
			});
			await pipeline.drain();

			expect(readCustomer({ pipeline })).toEqual({
				balance: STARTING_BALANCE - 10,
				openLocks: [],
				atomSeqs: { atom_1: { w_1: 3 } },
			});
		}));

	test("replayed in a later batch, it moves nothing", () =>
		withPipeline(async (pipeline) => {
			const release = atomFinalizeOf({ customerId, lockId: "L1", seq: 2 });
			await pipeline.consumeBatch({ commands: [lockTrack, release] });
			await pipeline.drain();
			await pipeline.consumeBatch({ commands: [release], firstOffset: 2 });
			await pipeline.drain();

			expect(readCustomer({ pipeline })).toEqual({
				balance: STARTING_BALANCE,
				openLocks: [],
				atomSeqs: { atom_1: { w_1: 2 } },
			});
		}));

	test("replayed after the Atom reused its lock id, under an id nothing remembers, it settles nothing: its seq is held and the new lock stays open", () =>
		withPipeline(async (pipeline) => {
			const reusedLock: TrackCommand = {
				...lockingTrackOf({ customerId, lockId: "L1", value: 10 }),
				commandId: "lock_L1_reused",
				requestId: "req_lock_L1_reused",
				lock: {
					id: "lck_L1_reused",
					lockId: "L1",
					expiresAt: testOccurredAt + 86_400_000,
					expiryAction: "confirm",
				},
				source: { atomId: "atom_1", writerId: "w_1", seq: 3 },
			};
			await pipeline.consumeBatch({
				commands: [
					lockTrack,
					atomFinalizeOf({ customerId, lockId: "L1", seq: 2 }),
					reusedLock,
				],
			});
			await pipeline.drain();
			await pipeline.consumeBatch({
				commands: [
					atomFinalizeOf({
						customerId,
						lockId: "L1",
						seq: 2,
						commandId: "atom_finalize_2_resent",
					}),
				],
				firstOffset: 3,
			});
			await pipeline.drain();

			expect(readCustomer({ pipeline })).toEqual({
				balance: STARTING_BALANCE - 10,
				openLocks: ["L1"],
				atomSeqs: { atom_1: { w_1: 3 } },
			});
		}));

	test("naming a lock Autumn holds under another feature, it settles nothing: the lock stays open and its seq lands", () =>
		withPipeline(async (pipeline) => {
			await pipeline.consumeBatch({
				commands: [
					lockTrack,
					atomFinalizeOf({
						customerId,
						lockId: "L1",
						seq: 2,
						featureId: "other_feature",
					}),
				],
			});
			await pipeline.drain();

			expect(readCustomer({ pipeline })).toEqual({
				balance: STARTING_BALANCE - 10,
				openLocks: ["L1"],
				atomSeqs: { atom_1: { w_1: 2 } },
			});
		}));
});
