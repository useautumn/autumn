import { describe, expect, test } from "bun:test";
import {
	checkCommand,
	decided,
	identity,
	residentFixture,
	trackCommand,
	waitForAppend,
} from "../../fixtures/heldTrack.js";

describe("inline checks", () => {
	test("a check on a resident customer is decided at once, exactly as the ordinary check decides it", async () => {
		const f = await residentFixture();
		try {
			const command = checkCommand({ requiredBalance: 5 });
			const inline = f.processor.checkInline({ command });
			expect(inline).toEqual({
				kind: "decided",
				reply: await f.processor.check({ command }),
			});
			expect(f.appender.batches).toEqual([1]);
		} finally {
			f.close();
		}
	});

	test("an inline and an ordinary check on the same view and second share one decision", async () => {
		const f = await residentFixture();
		try {
			const ordinary = await f.processor.check({ command: checkCommand() });
			const inline = decided(
				f.processor.checkInline({
					command: checkCommand({ occurredAt: 1_700_000_000_900 }),
				}),
			);
			expect(inline.reply).toBe(ordinary);
			expect(f.processor.readCounters()).toMatchObject({
				checkMemoHits: 1,
				checkMemoMisses: 1,
			});
		} finally {
			f.close();
		}
	});

	test("a check reads the customer's held tracks before they commit, as the ordinary check does", async () => {
		const f = await residentFixture();
		try {
			const before = f.processor.checkInline({ command: checkCommand() });
			f.processor.trackInline({
				command: trackCommand({ commandId: "held", value: 7 }),
			});
			const command = checkCommand();
			const inline = f.processor.checkInline({ command });
			expect(inline).toEqual({
				kind: "decided",
				reply: await f.processor.check({ command }),
			});
			expect(inline).not.toEqual(before);
			await waitForAppend();
			f.appender.release();
		} finally {
			f.close();
		}
	});

	test("an entity or customer whose rows are not resident is handed to the ordinary path", async () => {
		const f = await residentFixture();
		try {
			for (const who of [
				{ ...identity, entityId: "ent_1" },
				{ ...identity, customerId: "cus_cold" },
			])
				expect(
					f.processor.checkInline({ command: checkCommand({ who }) }),
				).toEqual({ kind: "refused", reason: "not_resident" });
		} finally {
			f.close();
		}
	});

	test("a check past a due reset falls through to the ordinary check, which answers on the reset balance", async () => {
		const resetAt = 1_700_000_500_000;
		const f = await residentFixture({ nextResetAt: resetAt });
		try {
			const drained = f.processor.track({
				command: trackCommand({ commandId: "drain", value: 99 }),
			});
			await waitForAppend();
			f.appender.release();
			await drained;
			const beforeReset = checkCommand({ occurredAt: resetAt });
			const afterReset = checkCommand({ occurredAt: resetAt + 1 });
			expect(
				decided(f.processor.checkInline({ command: beforeReset })).reply.result
					.allowed,
			).toBe(false);
			expect(f.processor.checkInline({ command: afterReset })).toEqual({
				kind: "refused",
				reason: "reset_due",
			});
			const ordinary = await f.processor.check({ command: afterReset });
			expect(ordinary.result.allowed).toBe(true);
		} finally {
			f.close();
		}
	});
});
