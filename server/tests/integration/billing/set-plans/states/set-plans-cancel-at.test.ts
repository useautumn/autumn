/**
 * set_plans is declarative about a scheduled cancellation: without an end date in the
 * request, the plans don't end, so Stripe's cancel_at is cleared however many phases there are.
 * Several phases clear it too, with a schedule carrying the later phase.
 * The preview says the scheduled cancellation is removed.
 */

import { expect, test } from "bun:test";
import { ms } from "@autumn/shared";
import {
	expectPreviewWarning,
	findStripeSubscriptionByStatus,
} from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const setupCancelingPro = async ({ customerId }: { customerId: string }) => {
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.cancel({ productId: pro.id }),
		],
	});
	const canceling = await findStripeSubscriptionByStatus({
		ctx: scenario.ctx,
		customerId,
		status: "active",
	});
	expect(canceling.cancel_at).not.toBeNull();
	return { ...scenario, pro, premium, canceling };
};

const expectCancelAtCleared = async ({
	ctx,
	subscriptionId,
}: {
	ctx: TestContext;
	subscriptionId: string;
}) => {
	const subscription =
		await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
	expect(subscription.status).toBe("active");
	expect(subscription.cancel_at).toBeNull();
	expect(subscription.cancel_at_period_end).toBe(false);
	return subscription;
};

test.concurrent(
	`${chalk.yellowBright("set-plans cancel_at: one phase without an end clears the scheduled cancellation")}`,
	async () => {
		const { customerId, autumnV2_4, ctx, pro, canceling } =
			await setupCancelingPro({ customerId: "set-plans-cancel-at-one-phase" });

		const setPlansParams = {
			customer_id: customerId,
			phases: [{ starts_at: "now" as const, plans: [{ plan_id: pro.id }] }],
		};
		expectPreviewWarning({
			preview: await autumnV2_4.billing.previewSetPlans(setPlansParams),
			type: "scheduled_cancel_changed",
			messageContains: ["is removed"],
		});
		await autumnV2_4.billing.setPlans(setPlansParams);

		await expectCancelAtCleared({ ctx, subscriptionId: canceling.id });
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans cancel_at: several phases without an end clear it and schedule the next phase")}`,
	async () => {
		const { customerId, autumnV2_4, ctx, pro, premium, canceling, advancedTo } =
			await setupCancelingPro({ customerId: "set-plans-cancel-at-phases" });

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: pro.id }] },
				{
					starts_at: advancedTo + ms.days(45),
					plans: [{ plan_id: premium.id }],
				},
			],
		});

		const subscription = await expectCancelAtCleared({
			ctx,
			subscriptionId: canceling.id,
		});
		expect(subscription.schedule).not.toBeNull();
	},
);
