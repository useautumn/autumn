/**
 * D2: a lock id retried while its lock is open is the same lock when the terms match: allowed, nothing moves twice.
 *
 *  sync (the API's check with a lock), after the lock landed → allowed, one row, deducted once;
 *  sync on other terms → a terms conflict, nothing moves;
 *  queued from an Atom in a later batch, on any terms → nothing moves and its seq lands, with no read of the row;
 *  queued twice in one batch → the second finds the first pending: one row;
 *  the same command resent inside the writer's window → a duplicate, as today.
 */

import { describe, expect, test } from "bun:test";
import {
	LockTermsConflictError,
	type TrackCommand,
} from "@autumn/balance-engine";
import {
	type CommandPipeline,
	createCommandPipeline,
	STARTING_BALANCE,
} from "../../fixtures/commandPipeline.js";
import { lockingTrackOf, takeLock } from "../../fixtures/queuedCommands.js";

const customerId = "cus_1";

/** The lock L1 over 10 asked for again under a new command id, optionally handed in by an Atom as entry `seq`. */
const retryOf = ({
	attempt,
	value = 10,
	seq,
}: {
	attempt: string;
	value?: number;
	seq?: number;
}): TrackCommand => ({
	...lockingTrackOf({ customerId, lockId: "L1", value }),
	commandId: `lock_L1_${attempt}`,
	requestId: `req_lock_L1_${attempt}`,
	...(seq && { source: { atomId: "atom_1", writerId: "w_1", seq } }),
});

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

describe("a lock id retried while its lock is open", () => {
	test("sync, on the same terms after the lock landed: allowed, one row, deducted once", () =>
		withPipeline(async (pipeline) => {
			await takeLock({ pipeline, customerId, lockId: "L1" });

			const reply = await pipeline.processor.track({
				command: retryOf({ attempt: "again" }),
			});
			await pipeline.drain();

			expect(reply.result).toMatchObject({ status: "applied" });
			expect(readCustomer({ pipeline })).toMatchObject({
				balance: STARTING_BALANCE - 10,
				openLocks: ["L1"],
			});
			// Taking a lock id nothing holds reads nothing; only the retry reads its row.
			expect(pipeline.lockReads).toEqual([["L1"]]);
		}));

	test("the same command sent twice inside the writer's window is answered as a duplicate, as today", () =>
		withPipeline(async (pipeline) => {
			const command = retryOf({ attempt: "once" });
			await pipeline.processor.track({ command });

			const again = await pipeline.processor.decideTrack({ command });

			expect(await again.waitForCommit()).toMatchObject({ kind: "duplicate" });
		}));

	test("sync, on other terms: a terms conflict, and nothing moves", () =>
		withPipeline(async (pipeline) => {
			await takeLock({ pipeline, customerId, lockId: "L1" });

			await expect(
				pipeline.processor.track({
					command: retryOf({ attempt: "bigger", value: 11 }),
				}),
			).rejects.toBeInstanceOf(LockTermsConflictError);
			await pipeline.drain();

			expect(readCustomer({ pipeline })).toMatchObject({
				balance: STARTING_BALANCE - 10,
				openLocks: ["L1"],
			});
		}));

	test("queued from an Atom in a later batch, on other terms: nothing moves, its seq lands, and no row is read", () =>
		withPipeline(async (pipeline) => {
			await pipeline.consumeBatch({
				commands: [retryOf({ attempt: "first", seq: 1 })],
			});
			await pipeline.drain();
			await pipeline.consumeBatch({
				commands: [retryOf({ attempt: "resent", seq: 2, value: 11 })],
				firstOffset: 1,
			});
			await pipeline.drain();

			expect(readCustomer({ pipeline })).toEqual({
				balance: STARTING_BALANCE - 10,
				openLocks: ["L1"],
				atomSeqs: { atom_1: { w_1: 2 } },
			});
			expect(pipeline.logs).not.toContain(
				"warn:Queued track refused; its Atom seq still lands",
			);
			expect(pipeline.lockReads).toEqual([]);
		}));

	test("queued twice in one batch: the second finds the first pending, and there is one row", () =>
		withPipeline(async (pipeline) => {
			await pipeline.consumeBatch({
				commands: [
					retryOf({ attempt: "first", seq: 1 }),
					retryOf({ attempt: "second", seq: 2 }),
				],
			});
			await pipeline.drain();

			expect(readCustomer({ pipeline })).toEqual({
				balance: STARTING_BALANCE - 10,
				openLocks: ["L1"],
				atomSeqs: { atom_1: { w_1: 2 } },
			});
			expect(pipeline.logs).not.toContain(
				"warn:Queued track refused; its Atom seq still lands",
			);
		}));
});
