import { describe, expect, test } from "bun:test";
import {
	checkCommand,
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
			expect(inline).not.toBeNull();
			expect(inline).toEqual(await f.processor.check({ command }));
			expect(f.appender.batches).toEqual([1]);
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
			expect(inline).toEqual(await f.processor.check({ command }));
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
				).toBeNull();
		} finally {
			f.close();
		}
	});
});
