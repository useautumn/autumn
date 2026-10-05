/**
 * Every command a queue can carry decides in one step and answers in another: the decide resolves
 * once the writer holds the record, before Kafka does, and only the sync reply waits for the commit.
 *
 * Red (before): the processor has no decide* methods; a command resolves only once committed.
 * Green (after): decide* resolve with the record still in flight; its commit yields the record.
 */

import { describe, expect, test } from "bun:test";
import {
	APPEND_MS,
	createCommandPipeline,
} from "../../fixtures/commandPipeline.js";
import {
	finalizeOf,
	resetOf,
	takeLock,
	trackOf,
	updateBalanceOf,
} from "../../fixtures/queuedCommands.js";

const createHeldPipeline = ({ at }: { at: number }) => {
	const held = Promise.withResolvers<void>();
	const pipeline = createCommandPipeline({
		heldAppend: { at, until: held.promise },
	});
	return { pipeline, release: () => held.resolve() };
};

const committedIds = ({
	pipeline,
}: {
	pipeline: ReturnType<typeof createCommandPipeline>;
}) => pipeline.commits.flat().map((record) => record.id);

describe("decide, then commit", () => {
	test("a track decides before Kafka has it, and its commit yields the deduction", async () => {
		const { pipeline, release } = createHeldPipeline({ at: 0 });
		try {
			const decided = await pipeline.processor.decideTrack({
				command: trackOf({ customerId: "cus_1", commandId: "track_1" }),
			});
			await Bun.sleep(APPEND_MS * 3);
			expect(decided.kind).toBe("write");
			expect(committedIds({ pipeline })).toEqual([]);

			release();
			const { mutation } = await decided.waitForCommit();
			expect(mutation.id).toBe("track_1");
			expect(mutation.result).toMatchObject({
				type: "track",
				status: "applied",
			});
			expect(committedIds({ pipeline })).toEqual(["track_1"]);
		} finally {
			release();
			await pipeline.close();
		}
	});

	test("a balance update decides the same way, and a reset with nothing due answers at its decide with no record", async () => {
		const { pipeline, release } = createHeldPipeline({ at: 0 });
		try {
			const update = await pipeline.processor.decideUpdateBalance({
				command: updateBalanceOf({
					customerId: "cus_1",
					commandId: "update_1",
				}),
			});
			const reset = await pipeline.processor.decideReset({
				command: resetOf({ customerId: "cus_2", commandId: "reset_1" }),
			});
			await Bun.sleep(APPEND_MS * 3);
			expect(update.kind).toBe("write");
			expect(reset.kind).toBe("reply");
			expect(await reset.waitForCommit()).toEqual({ result: null });
			expect(committedIds({ pipeline })).toEqual([]);

			release();
			const committed = await update.waitForCommit();
			expect("mutation" in committed && committed.mutation.id).toBe("update_1");
			expect(committedIds({ pipeline })).toEqual(["update_1"]);
		} finally {
			release();
			await pipeline.close();
		}
	});

	test("a finalize settles a lock taken on the sync path in the same two steps", async () => {
		const { pipeline, release } = createHeldPipeline({ at: 1 });
		try {
			const lock = await takeLock({
				pipeline,
				customerId: "cus_1",
				lockId: "L1",
			});
			const decided = await pipeline.processor.decideFinalize({
				command: finalizeOf({ lock, finalValue: 0 }),
			});
			await Bun.sleep(APPEND_MS * 3);
			expect(decided.kind).toBe("write");
			expect(committedIds({ pipeline })).toEqual(["lock_L1"]);

			release();
			const { mutation } = await decided.waitForCommit();
			expect(mutation.result).toMatchObject({ type: "finalize" });
			expect(committedIds({ pipeline })).toEqual(["lock_L1", "finalize_L1"]);
		} finally {
			release();
			await pipeline.close();
		}
	});
});
