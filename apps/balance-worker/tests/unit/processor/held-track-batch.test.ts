import { describe, expect, test } from "bun:test";
import {
	MutationBatchNotCommittedError,
	PartitionWriterCommandConflictError,
} from "../../../src/processor/writer/writerErrors.js";
import type { FailedPosition } from "../../../src/runtime/commitPositions/types/commitPositions.js";
import {
	identity,
	partition,
	residentFixture,
	trackCommand,
	waitForAppend,
} from "../../fixtures/heldTrack.js";

describe("inline track batches", () => {
	test("a batch is decided whole, each command's reply in order, held on its last write", async () => {
		const f = await residentFixture();
		try {
			const outcome = f.processor.trackBatchInline({
				commands: [
					trackCommand({ commandId: "b1", value: 1 }),
					trackCommand({ commandId: "b2", value: 2 }),
				],
			});
			expect(outcome.kind).toBe("decided");
			if (outcome.kind !== "decided") return;
			expect(outcome.seq).toBe(3);
			expect(outcome.items.map((item) => item.ok)).toEqual([true, true]);
			await waitForAppend();
			expect(f.appender.batches).toEqual([1]);
			f.appender.release();
			await waitForAppend();
			expect(f.appender.batches).toEqual([1, 2]);
			expect(f.positions.readCommitPosition({ partition })).toBe(3);
		} finally {
			f.close();
		}
	});

	test("one command the ordinary path must take refuses the whole batch before anything is decided", async () => {
		const f = await residentFixture();
		try {
			const outcome = f.processor.trackBatchInline({
				commands: [
					trackCommand({ commandId: "ok" }),
					trackCommand({
						commandId: "cold",
						who: { ...identity, customerId: "cus_cold" },
					}),
				],
			});
			expect(outcome).toEqual({ kind: "refused", reason: "not_resident" });
			await waitForAppend();
			expect(f.appender.batches).toEqual([1]);
			const retry = f.processor.trackInline({
				command: trackCommand({ commandId: "ok" }),
			});
			expect(retry?.seq).toBe(2);
		} finally {
			f.close();
		}
	});

	test("a retry of a write still in flight sends the batch to the ordinary path", async () => {
		const f = await residentFixture();
		try {
			f.processor.trackInline({ command: trackCommand({ commandId: "r" }) });
			expect(
				f.processor.trackBatchInline({
					commands: [trackCommand({ commandId: "r" })],
				}),
			).toEqual({ kind: "refused", reason: "retry_in_flight" });
		} finally {
			f.close();
		}
	});

	test("a command that fails on its own fails alone; the rest of the batch is written", async () => {
		const f = await residentFixture();
		try {
			const outcome = f.processor.trackBatchInline({
				commands: [
					trackCommand({ commandId: "same", value: 1 }),
					trackCommand({ commandId: "same", value: 2 }),
					trackCommand({ commandId: "other", value: 1 }),
				],
			});
			if (outcome.kind !== "decided") throw new Error("expected a decision");
			expect(outcome.items.map((item) => item.ok)).toEqual([true, false, true]);
			expect(outcome.items[1]).toMatchObject({
				cause: expect.any(PartitionWriterCommandConflictError),
			});
			expect(outcome.seq).toBe(3);
			await waitForAppend();
			f.appender.release();
			await waitForAppend();
			expect(f.appender.batches).toEqual([1, 2]);
		} finally {
			f.close();
		}
	});

	test("a batch's writes never straddle two appends, even past the batch size", async () => {
		const f = await residentFixture({ maxBatchSize: 2 });
		try {
			f.processor.trackInline({ command: trackCommand({ commandId: "lead" }) });
			f.processor.trackBatchInline({
				commands: ["g1", "g2", "g3"].map((commandId) =>
					trackCommand({ commandId }),
				),
			});
			await waitForAppend();
			f.appender.release();
			await waitForAppend();
			f.appender.release();
			await waitForAppend();
			expect(f.appender.batches).toEqual([1, 1, 3]);
		} finally {
			f.close();
		}
	});

	test("a refused append fails every write of the batch together", async () => {
		const f = await residentFixture();
		const failed: FailedPosition[] = [];
		f.positions.onFailedAbove((position) => failed.push(position));
		try {
			f.processor.trackBatchInline({
				commands: [
					trackCommand({ commandId: "x1" }),
					trackCommand({ commandId: "x2" }),
				],
			});
			await waitForAppend();
			f.appender.release({
				fail: new MutationBatchNotCommittedError({ cause: new Error("no") }),
			});
			await waitForAppend();
			expect(failed).toMatchObject([{ partition, seq: 1, lastSeq: 3 }]);
		} finally {
			f.close();
		}
	});
});
