/**
 * Regression: update_plan version migrations must carry active free-product trial_ends_at.
 * Pre-fix replacements became active without a trial; post-fix they keep the trial isolated from paid subscriptions.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectStripeSubscriptionUnchanged } from "@tests/integration/billing/utils/stripe/expectStripeSubscriptionUnchanged";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../utils/runUpdatePlanMigration";

test.concurrent(
	`${chalk.yellowBright("migrations update_plan: free trial v1->v2 carries trial without trialing paid subscription")}`,
	async () => {
		const customerId = "mig-free-trial-carryover-paid-guard";
		const freeTrial = products.baseWithTrial({
			id: "mig-free-trial-carryover",
			items: [items.monthlyMessages({ includedUsage: 100 })],
			trialDays: 14,
			cardRequired: false,
		});
		const paidAddon = products.recurringAddOn({
			id: "mig-free-trial-paid-addon",
			items: [items.monthlyCredits({ includedUsage: 50 })],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [freeTrial, paidAddon] }),
			],
			actions: [
				s.billing.attach({ productId: freeTrial.id }),
				s.billing.attach({ productId: paidAddon.id }),
			],
		});

		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const trialEndsAt = await expectProductTrialing({
			customer: customerBefore,
			productId: freeTrial.id,
		});
		expect(trialEndsAt).toBeDefined();
		await expectProductNotTrialing({
			customer: customerBefore,
			productId: paidAddon.id,
		});

		const stripeCustomerId = customerBefore.stripe_id;
		expect(stripeCustomerId).toBeDefined();
		const subsBefore = await ctx.stripeCli.subscriptions.list({
			customer: stripeCustomerId as string,
			status: "all",
		});
		const paidSubBefore = subsBefore.data.find(
			(sub) => sub.status === "active" || sub.status === "trialing",
		);
		expect(paidSubBefore).toBeDefined();
		expect(paidSubBefore!.status).not.toBe("trialing");

		await autumnV1.products.update(freeTrial.id, {
			items: [
				items.monthlyMessages({ includedUsage: 200 }),
				items.monthlyUsers({ includedUsage: 10 }),
			],
		});

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig`,
			customerId,
			filter: { customer: { plan: { plan_id: freeTrial.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: freeTrial.id },
						version: 2,
					},
				],
			},
			runOnServer: false,
		});

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfter,
			active: [freeTrial.id, paidAddon.id],
		});
		await expectProductTrialing({
			customer: customerAfter,
			productId: freeTrial.id,
			trialEndsAt: trialEndsAt!,
		});
		await expectProductNotTrialing({
			customer: customerAfter,
			productId: paidAddon.id,
		});
		expectCustomerFeatureCorrect({
			customer: customerAfter,
			featureId: TestFeature.Messages,
			includedUsage: 200,
			balance: 200,
			usage: 0,
		});
		expectCustomerFeatureCorrect({
			customer: customerAfter,
			featureId: TestFeature.Users,
			includedUsage: 10,
			balance: 10,
			usage: 0,
		});

		const paidSubAfter = await ctx.stripeCli.subscriptions.retrieve(
			paidSubBefore!.id,
		);
		expect(paidSubAfter.status).not.toBe("trialing");
		expectStripeSubscriptionUnchanged({
			before: paidSubBefore!,
			after: paidSubAfter,
		});
	},
);
