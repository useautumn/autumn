/**
 * Where the row behind an Atom's lock id lives while its finalize is applied.
 *
 *  decided in this batch, the store not yet applied → the writer's pending row;
 *  applied by the store → no longer pending, and the batch's one read finds it;
 *  never taken, or held by another customer → null.
 */

import { afterEach, describe, expect, test } from "bun:test";
import type { WorkerLock } from "@autumn/balance-engine";
import { resolveLockRow } from "../../../src/consume/resolveLockRow.js";
import {
	type CommandPipeline,
	createCommandPipeline,
	identityOf,
} from "../../fixtures/commandPipeline.js";
import { lockingTrackOf, takeLock } from "../../fixtures/queuedCommands.js";

let pipeline: CommandPipeline | undefined;
afterEach(async () => {
	await pipeline?.close();
	pipeline = undefined;
});

const named = ({
	customerId,
	lockId,
}: {
	customerId: string;
	lockId: string;
}) => ({
	identity: identityOf({ customerId }),
	lockId,
});

const keyOf = ({ lockId }: { lockId: string }) => ({
	orgId: "org_1",
	env: "sandbox",
	lockId,
});

describe("resolveLockRow", () => {
	test("a lock decided in this batch is the writer's pending row, before the store has it", async () => {
		const applied = Promise.withResolvers<void>();
		pipeline = createCommandPipeline({ heldApply: applied.promise });
		await pipeline.processor.decideTrack({
			command: lockingTrackOf({ customerId: "cus_1", lockId: "L1" }),
		});
		const command = named({ customerId: "cus_1", lockId: "L1" });

		const row = resolveLockRow({
			pending: pipeline.processor.pendingLockRow(command),
			rows: [],
			command,
		});

		expect(row).toMatchObject({
			id: "lck_L1",
			lock_id: "L1",
			customer_id: "cus_1",
			feature_id: "messages",
		});
		applied.resolve();
	});

	test("once the store has applied it, the lock is no longer pending and the batch's read finds it", async () => {
		pipeline = createCommandPipeline();
		await takeLock({ pipeline, customerId: "cus_1", lockId: "L1" });
		const command = named({ customerId: "cus_1", lockId: "L1" });

		const pending = pipeline.processor.pendingLockRow(command);
		const rows = await pipeline.processor.readLockRows({
			keys: [keyOf({ lockId: "L1" })],
		});

		expect(pending).toBeNull();
		expect(resolveLockRow({ pending, rows, command })).toMatchObject({
			id: "lck_L1",
			lock_id: "L1",
		});
		expect(pipeline.lockReads).toEqual([["L1"]]);
	});

	test("a lock never taken is null", async () => {
		pipeline = createCommandPipeline();
		const command = named({ customerId: "cus_1", lockId: "L_missing" });

		const rows = await pipeline.processor.readLockRows({
			keys: [keyOf({ lockId: "L_missing" })],
		});

		expect(
			resolveLockRow({
				pending: pipeline.processor.pendingLockRow(command),
				rows,
				command,
			}),
		).toBeNull();
	});

	test("in a batch with two customers' finalizes each resolves to its own row, and a row held by another customer is never matched", async () => {
		pipeline = createCommandPipeline();
		const first = await takeLock({
			pipeline,
			customerId: "cus_1",
			lockId: "L1",
		});
		const second = await takeLock({
			pipeline,
			customerId: "cus_2",
			lockId: "L2",
		});
		const rows: WorkerLock[] = await pipeline.processor.readLockRows({
			keys: [keyOf({ lockId: "L1" }), keyOf({ lockId: "L2" })],
		});
		const resolve = (command: ReturnType<typeof named>) =>
			resolveLockRow({ pending: null, rows, command });

		expect(resolve(named({ customerId: "cus_1", lockId: "L1" }))).toEqual(
			first,
		);
		expect(resolve(named({ customerId: "cus_2", lockId: "L2" }))).toEqual(
			second,
		);
		expect(resolve(named({ customerId: "cus_2", lockId: "L1" }))).toBeNull();
	});
});
