/**
 * Billing Verify: Cancel State Mismatch
 *
 * Contract under test (billingActions.verify):
 *   New behavior:
 *     - Autumn expects the subscription to be canceling at period end (scheduled
 *       via `s.cancel`) but Stripe's `cancel_at` was cleared directly -> mismatch
 *       { type: "cancel_state_mismatch", expected_canceling: true,
 *       actual_canceling: false }.
 */

import { expect, test } from "bun:test";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { verify } from "@/internal/billing/v2/actions/verify/verify";
import { CusService } from "@/internal/customers/CusService";
import { listActiveStripeSubscriptions } from "../restore/utils/corruptStripeSubscription";

const stripeCustomerIdFor = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const stripeCustomerId = fullCustomer.processor?.id;
	if (!stripeCustomerId)
		throw new Error(`Customer ${customerId} has no Stripe customer ID`);
	return stripeCustomerId;
};

test.concurrent(
	`${chalk.yellowBright("billing-verify cancel-mismatch: cancel_at cleared directly on Stripe -> cancel_state_mismatch")}`,
	async () => {
		const customerId = "verify-cancel-state-mismatch";

		const pro = products.pro({ id: "pro", items: [] });

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.cancel({ productId: pro.id }),
			],
		});

		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});
		expect(sub.cancel_at).not.toBeNull();

		await ctx.stripeCli.subscriptions.update(sub.id, {
			cancel_at_period_end: false,
		});

		const result = await verify({ ctx, params: { customer_id: customerId } });

		expect(result.subscriptions.length).toBe(1);
		expect(result.subscriptions[0].status).toBe("mismatched");
		expect(result.subscriptions[0].mismatches).toMatchObject([
			{
				type: "cancel_state_mismatch",
				expected_canceling: true,
				actual_canceling: false,
			},
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("billing-verify cancel-mismatch 2: cancel implemented via end_behavior=cancel schedule -> correct")}`,
	async () => {
		const customerId = "verify-cancel-via-schedule";

		const pro = products.pro({ id: "pro", items: [] });

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({ productId: pro.id }),
				s.cancel({ productId: pro.id }),
			],
		});

		const stripeCustomerId = await stripeCustomerIdFor({ ctx, customerId });
		const [sub] = await listActiveStripeSubscriptions({
			ctx,
			stripeCustomerId,
		});
		expect(sub.cancel_at).not.toBeNull();

		// Same cancel, implemented as a schedule instead of a bare cancel_at —
		// one phase ending at the cancel time, then the schedule cancels.
		await ctx.stripeCli.subscriptions.update(sub.id, {
			cancel_at_period_end: false,
		});
		const schedule = await ctx.stripeCli.subscriptionSchedules.create({
			from_subscription: sub.id,
		});
		await ctx.stripeCli.subscriptionSchedules.update(schedule.id, {
			end_behavior: "cancel",
			phases: [
				{
					start_date: schedule.phases[0].start_date,
					end_date: sub.cancel_at as number,
					items: sub.items.data.map((item) => ({
						price: item.price.id,
						...(item.price.recurring?.usage_type === "licensed"
							? { quantity: item.quantity ?? 1 }
							: {}),
					})),
				},
			],
		});

		const result = await verify({ ctx, params: { customer_id: customerId } });

		// ── Contract: a schedule that cancels at the expected time IS the
		// expected cancel — no mismatch. ──────────────────────────────────
		expect(result.subscriptions.length).toBe(1);
		expect(result.subscriptions[0].mismatches).toEqual([]);
		expect(result.subscriptions[0].status).toBe("correct");
	},
);
