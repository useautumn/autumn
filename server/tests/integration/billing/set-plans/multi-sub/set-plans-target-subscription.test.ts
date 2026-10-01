/**
 * set_plans with stripe_subscription_id edits only that subscription: plans
 * billed on another subscription keep their row and subscription.
 */

import { expect, test } from "bun:test";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import chalk from "chalk";
import {
	fetchLiveCustomerProduct,
	initMultiSubScenario,
} from "./multiSubScenario";

test.concurrent(
	`${chalk.yellowBright("set-plans multi-sub: Pro to Premium on subscription A leaves B's plan untouched")}`,
	async () => {
		const customerId = "set-plans-multi-sub-upgrade";
		const { autumnV2_4, ctx, subscriptionA, subscriptionB, plans } =
			await initMultiSubScenario({ customerId });
		const seatsBefore = await fetchLiveCustomerProduct({
			ctx,
			customerId,
			productId: plans.seats.id,
		});

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			stripe_subscription_id: subscriptionA,
			phases: [{ starts_at: "now", plans: [{ plan_id: plans.premium.id }] }],
		});

		const premium = await fetchLiveCustomerProduct({
			ctx,
			customerId,
			productId: plans.premium.id,
		});
		const seatsAfter = await fetchLiveCustomerProduct({
			ctx,
			customerId,
			productId: plans.seats.id,
		});
		expect(premium?.subscription_ids).toEqual([subscriptionA]);
		expect(seatsAfter?.id).toBe(seatsBefore?.id);
		expect(seatsAfter?.status).toBe(seatsBefore?.status);
		expect(seatsAfter?.subscription_ids).toEqual([subscriptionB]);
		expect(
			await fetchLiveCustomerProduct({
				ctx,
				customerId,
				productId: plans.pro.id,
			}),
		).toBeUndefined();

		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 2 },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans multi-sub: omitting a plan on subscription A ends only that plan, and the free add-on customer-wide")}`,
	async () => {
		const customerId = "set-plans-multi-sub-omit";
		const { autumnV2_4, ctx, subscriptionA, subscriptionB, plans } =
			await initMultiSubScenario({ customerId });

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			stripe_subscription_id: subscriptionA,
			phases: [
				{
					starts_at: "now",
					plans: [
						{ plan_id: plans.pro.id },
						{ plan_id: plans.monthlyAddOn.id },
						{ plan_id: plans.freeAddOn.id },
					],
				},
			],
		});
		const seatsBefore = await fetchLiveCustomerProduct({
			ctx,
			customerId,
			productId: plans.seats.id,
		});

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			stripe_subscription_id: subscriptionA,
			phases: [{ starts_at: "now", plans: [{ plan_id: plans.pro.id }] }],
		});

		const fetchLive = (productId: string) =>
			fetchLiveCustomerProduct({ ctx, customerId, productId });
		expect(await fetchLive(plans.monthlyAddOn.id)).toBeUndefined();
		expect(await fetchLive(plans.freeAddOn.id)).toBeUndefined();
		expect((await fetchLive(plans.pro.id))?.subscription_ids).toEqual([
			subscriptionA,
		]);
		const seatsAfter = await fetchLive(plans.seats.id);
		expect(seatsAfter?.id).toBe(seatsBefore?.id);
		expect(seatsAfter?.subscription_ids).toEqual([subscriptionB]);

		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 2 },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans multi-sub: a new paid add-on bills on subscription A")}`,
	async () => {
		const customerId = "set-plans-multi-sub-add";
		const { autumnV2_4, ctx, subscriptionA, subscriptionB, plans } =
			await initMultiSubScenario({ customerId });
		const seatsBefore = await fetchLiveCustomerProduct({
			ctx,
			customerId,
			productId: plans.seats.id,
		});

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			stripe_subscription_id: subscriptionA,
			phases: [
				{
					starts_at: "now",
					plans: [
						{ plan_id: plans.pro.id },
						{ plan_id: plans.monthlyAddOn.id },
					],
				},
			],
		});

		const monthlyAddOn = await fetchLiveCustomerProduct({
			ctx,
			customerId,
			productId: plans.monthlyAddOn.id,
		});
		const seatsAfter = await fetchLiveCustomerProduct({
			ctx,
			customerId,
			productId: plans.seats.id,
		});
		expect(monthlyAddOn?.subscription_ids).toContain(subscriptionA);
		expect(monthlyAddOn?.subscription_ids).not.toContain(subscriptionB);
		expect(seatsAfter?.id).toBe(seatsBefore?.id);
		expect(seatsAfter?.subscription_ids).toEqual([subscriptionB]);

		await expectStripeSubscriptionCorrect({
			ctx,
			customerId,
			options: { subCount: 2 },
		});
	},
);
