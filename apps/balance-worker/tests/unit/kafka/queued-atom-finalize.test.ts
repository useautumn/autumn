/**
 * An Atom's finalize, queued behind its tracks: it names its lock, and the worker settles Autumn's own row.
 *
 *  the lock taken in the same batch → found pending, settled, its row deleted, the seq lands;
 *  the lock taken in an earlier batch → found by the batch's one read, settled;
 *  a lock already settled, or a replayed finalize → nothing moves, the seq lands;
 *  a held row whose feature is not the one named → refused, the lock stays open, the seq lands.
 */

import { describe, expect, test } from "bun:test";
import type { TrackCommand } from "@autumn/balance-engine";
import {
	type CommandPipeline,
	createCommandPipeline,
	STARTING_BALANCE,
} from "../../fixtures/commandPipeline.js";
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

	test("naming a lock Autumn holds under another feature, it is refused: the lock stays open and its seq lands", () =>
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
