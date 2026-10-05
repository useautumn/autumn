import { expect, test } from "bun:test";
import { AdvanceTestClockResponseSchema } from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import type Stripe from "stripe";

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

test("customers.advance_test_clock attaches a clock to an unclocked sandbox customer", async () => {
	const { customerId, autumnV2_2, ctx, customer } = await initScenario({
		customerId: "advance-test-clock-attach",
		setup: [s.customer({ testClock: false })],
		actions: [],
	});
	const stripeCustomerId = customer?.processor?.id;
	if (!stripeCustomerId) throw new Error("Expected a Stripe customer");
	const before = (await ctx.stripeCli.customers.retrieve(
		stripeCustomerId,
	)) as Stripe.Customer;
	expect(before.test_clock).toBeNull();

	const frozenTime = (Math.floor(Date.now() / 1000) + 3600) * 1000;
	const response = AdvanceTestClockResponseSchema.parse(
		await autumnV2_2.post("/customers.advance_test_clock", {
			customer_id: customerId,
			frozen_time: frozenTime,
		}),
	);
	expect(response.status).toBe("advancing");

	const after = (await ctx.stripeCli.customers.retrieve(stripeCustomerId, {
		expand: ["test_clock"],
	})) as Stripe.Customer;
	const clock = after.test_clock as Stripe.TestHelpers.TestClock;
	expect(clock?.id).toMatch(/^clock_/);
	let current = clock;
	for (
		let attempt = 0;
		attempt < 90 &&
		(current.status !== "ready" || current.frozen_time * 1000 !== frozenTime);
		attempt++
	) {
		await Bun.sleep(1000);
		current = await ctx.stripeCli.testHelpers.testClocks.retrieve(clock.id);
	}
	expect(current.status).toBe("ready");
	expect(current.frozen_time * 1000).toBe(frozenTime);
});
