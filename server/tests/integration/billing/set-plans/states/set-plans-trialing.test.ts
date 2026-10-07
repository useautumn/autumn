/**
 * set_plans on a trialing subscription keeps the trial in Stripe and Autumn, and `free_trial: null` ends it in both and bills now.
 * Like Stripe's update with trial_end now, the full period is billed whatever the proration_behavior.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV5, secondsToMs } from "@autumn/shared";
import {
	expectPreviewWarning,
	findStripeSubscriptionByStatus,
} from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import {
	expectSubscriptionNotTrialing,
	expectSubscriptionTrialing,
} from "@tests/integration/billing/utils/expect-customer-products/expectSubscriptionTrialing";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const setupTrialingPro = async ({ customerId }: { customerId: string }) => {
	const proTrial = products.proWithTrial({
		items: [items.monthlyMessages({ includedUsage: 100 })],
		trialDays: 14,
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.billing.attach({ productId: proTrial.id })],
	});
	const trialing = await findStripeSubscriptionByStatus({
		ctx: scenario.ctx,
		customerId,
		status: "trialing",
	});
	return { ...scenario, proTrial, trialing };
};

test.concurrent(
	`${chalk.yellowBright("set-plans trialing: the Stripe trial carries into the new Autumn rows")}`,
	async () => {
		const { customerId, autumnV2_4, ctx, proTrial, trialing } =
			await setupTrialingPro({ customerId: "set-plans-trial-carried" });

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [
				{
					starts_at: "now",
					proration_behavior: "none",
					plans: [{ plan_id: proTrial.id }],
				},
			],
		});

		const updated = await ctx.stripeCli.subscriptions.retrieve(trialing.id);
		expect(updated.status).toBe("trialing");
		expect(updated.trial_end).toBe(trialing.trial_end);
		await expectSubscriptionTrialing({
			customer: await autumnV2_4.customers.get<ApiCustomerV5>(customerId),
			productId: proTrial.id,
			trialEndsAt: secondsToMs(trialing.trial_end!),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trialing: free_trial null ends the trial on both sides")}`,
	async () => {
		const { customerId, autumnV2_4, ctx, proTrial, trialing, advancedTo } =
			await setupTrialingPro({ customerId: "set-plans-trial-ended" });

		const setPlansParams = {
			customer_id: customerId,
			free_trial: null,
			phases: [
				{ starts_at: "now" as const, plans: [{ plan_id: proTrial.id }] },
			],
		};
		const preview = await autumnV2_4.billing.previewSetPlans(setPlansParams);
		expectPreviewWarning({ preview, type: "trial_ended" });
		expect(preview.total).toBe(20);
		await autumnV2_4.billing.setPlans(setPlansParams);

		const ended = await ctx.stripeCli.subscriptions.retrieve(trialing.id);
		expect(ended.status).toBe("active");
		expect(secondsToMs(ended.trial_end!)).toBeLessThanOrEqual(advancedTo);
		await expectSubscriptionNotTrialing({
			customer: await autumnV2_4.customers.get<ApiCustomerV5>(customerId),
			productId: proTrial.id,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestStatus: "paid",
			latestTotal: 20,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trialing: free_trial null with proration none still bills the full period now, like Stripe")}`,
	async () => {
		const { customerId, autumnV2_4, ctx, proTrial, trialing } =
			await setupTrialingPro({ customerId: "set-plans-trial-ended-none" });

		const setPlansParams = {
			customer_id: customerId,
			free_trial: null,
			phases: [
				{
					starts_at: "now" as const,
					proration_behavior: "none" as const,
					plans: [{ plan_id: proTrial.id }],
				},
			],
		};
		const preview = await autumnV2_4.billing.previewSetPlans(setPlansParams);
		expectPreviewWarning({ preview, type: "trial_ended" });
		expect(preview.total).toBe(20);

		await autumnV2_4.billing.setPlans(setPlansParams);

		const ended = await ctx.stripeCli.subscriptions.retrieve(trialing.id);
		expect(ended.status).toBe("active");
		await expectSubscriptionNotTrialing({
			customer: await autumnV2_4.customers.get<ApiCustomerV5>(customerId),
			productId: proTrial.id,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestStatus: "paid",
			latestTotal: 20,
		});
	},
);
