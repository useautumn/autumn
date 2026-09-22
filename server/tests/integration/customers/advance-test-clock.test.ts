import { expect, test } from "bun:test";
import { AdvanceTestClockResponseSchema } from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";

test("customers.advance_test_clock advances a customer's Stripe clock", async () => {
	const { customerId, autumnV2_2, ctx, testClockId } = await initScenario({
		customerId: "billing-advance-test-clock-target",
		setup: [s.customer({ paymentMethod: "success" })],
		actions: [],
	});
	if (!testClockId) throw new Error("Expected a Stripe test clock");
	const clock =
		await ctx.stripeCli.testHelpers.testClocks.retrieve(testClockId);
	const frozenTime = (clock.frozen_time + 60) * 1000;
	const response = AdvanceTestClockResponseSchema.parse(
		await autumnV2_2.post("/customers.advance_test_clock", {
			customer_id: customerId,
			frozen_time: frozenTime + 999,
		}),
	);
	expect(response.customer_id).toBe(customerId);
	expect(response.status).toBe("advancing");
	expect(Number.isInteger(response.frozen_time)).toBe(true);
	let updatedClock =
		await ctx.stripeCli.testHelpers.testClocks.retrieve(testClockId);
	for (
		let attempt = 0;
		attempt < 30 && updatedClock.status === "advancing";
		attempt++
	) {
		await Bun.sleep(1000);
		updatedClock =
			await ctx.stripeCli.testHelpers.testClocks.retrieve(testClockId);
	}
	expect(updatedClock.status).toBe("ready");
	expect(updatedClock.frozen_time * 1000).toBe(frozenTime);
	await expect(
		autumnV2_2.post("/customers.advance_test_clock", {
			customer_id: customerId,
			frozen_time: clock.frozen_time * 1000 + 999,
		}),
	).rejects.toThrow();
});
