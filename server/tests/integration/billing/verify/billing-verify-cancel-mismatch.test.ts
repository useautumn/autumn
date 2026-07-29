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
