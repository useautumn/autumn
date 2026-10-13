// With persist_free_overage: true, a one-off add-on purchase clears recurring overage
// first and grants only the remainder. Without it, overage stays on the recurring balance.

import { expect, test } from "bun:test";
import type { ApiCustomerV5, AttachParamsV1Input } from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	buildScenarioProducts,
	findPlanBreakdown,
	INCLUDED_PER_BALANCE,
	OVERAGE,
	PURCHASED_CREDITS,
} from "./utils/oneOffAddonOveragePaydown";

const PENDING_CHECKOUT_OVERAGE = 100_000;

test.concurrent(
	`${chalk.yellowBright("one-off add-on overage paydown: immediate-access checkout applies paydown once")}`,
	async () => {
		const { recurringPlan, oneOffAddOn } = buildScenarioProducts();
		const { customerId, autumnV2_2, ctx } = await initScenario({
			customerId: "one-off-overage-immediate-checkout",
			setup: [
				s.platform.create({
					userEmail: `one-off-immediate-${Math.random().toString(36).slice(2)}@autumn.test`,
					configOverrides: { persist_free_overage: true },
					setupDefaultFeatures: true,
				}),
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [recurringPlan, oneOffAddOn] }),
			],
			actions: [
				s.billing.attach({ productId: recurringPlan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: INCLUDED_PER_BALANCE * 2 + OVERAGE,
					timeout: 2000,
				}),
				s.removePaymentMethod(),
			],
		});

		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: oneOffAddOn.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: PURCHASED_CREDITS },
			],
			enable_plan_immediately: true,
			redirect_mode: "if_required",
		});
		expect(result.payment_url).toContain("checkout.stripe.com");

		await completeStripeCheckoutFormV2({ url: result.payment_url! });

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const recurring = findPlanBreakdown({
			customer,
			planId: recurringPlan.id,
			interval: "month",
		});
		const addOn = findPlanBreakdown({
			customer,
			planId: oneOffAddOn.id,
			interval: "one_off",
		});

		expect(recurring).toMatchObject({
			remaining: 0,
			usage: INCLUDED_PER_BALANCE,
		});
		expect(addOn).toMatchObject({
			prepaid_grant: PURCHASED_CREDITS,
			remaining: PURCHASED_CREDITS - OVERAGE,
			usage: OVERAGE,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("one-off add-on overage paydown: deferred checkout uses completion-time overage")}`,
	async () => {
		const { recurringPlan, oneOffAddOn } = buildScenarioProducts();
		const { customerId, autumnV2_2, ctx } = await initScenario({
			customerId: "one-off-overage-deferred-checkout",
			setup: [
				s.platform.create({
					userEmail: `one-off-deferred-${Math.random().toString(36).slice(2)}@autumn.test`,
					configOverrides: { persist_free_overage: true },
					setupDefaultFeatures: true,
				}),
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [recurringPlan, oneOffAddOn] }),
			],
			actions: [
				s.billing.attach({ productId: recurringPlan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: INCLUDED_PER_BALANCE * 2 + OVERAGE,
					timeout: 2000,
				}),
				s.removePaymentMethod(),
			],
		});

		const result = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: oneOffAddOn.id,
			feature_quantities: [
				{ feature_id: TestFeature.Messages, quantity: PURCHASED_CREDITS },
			],
			redirect_mode: "if_required",
		});
		expect(result.payment_url).toContain("checkout.stripe.com");

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: PENDING_CHECKOUT_OVERAGE,
		});
		await completeStripeCheckoutFormV2({ url: result.payment_url! });

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		const recurring = findPlanBreakdown({
			customer,
			planId: recurringPlan.id,
			interval: "month",
		});
		const addOn = findPlanBreakdown({
			customer,
			planId: oneOffAddOn.id,
			interval: "one_off",
		});
		const totalOverage = OVERAGE + PENDING_CHECKOUT_OVERAGE;

		expect(recurring).toMatchObject({
			remaining: 0,
			usage: INCLUDED_PER_BALANCE,
		});
		expect(addOn).toMatchObject({
			prepaid_grant: PURCHASED_CREDITS,
			remaining: PURCHASED_CREDITS - totalOverage,
			usage: totalOverage,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
