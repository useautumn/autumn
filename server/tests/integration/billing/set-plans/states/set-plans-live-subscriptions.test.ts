/** set_plans updates collectable live subscriptions (active, past_due, pause_collection) in place and keeps the billing cycle anchor setup works out for its plans. */

import { expect, test } from "bun:test";
import {
	anchoredToMonthStart,
	expectStripeSubscriptionAnchorCorrect,
	nextMonthStartMs,
} from "@tests/integration/billing/attach/params/anchor-to-month-start/utils/anchorToMonthStartUtils";
import {
	expectPreviewWarning,
	findStripeSubscriptionByStatus,
} from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { driveProductPastDue } from "@tests/integration/billing/utils/driveProductPastDue";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("set-plans anchor: month-start plan with no requested anchor anchors to the 1st")}`,
	async () => {
		const pro = anchoredToMonthStart(
			products.pro({
				items: [items.monthlyMessages({ includedUsage: 100 })],
			}),
		);

		const { customerId, autumnV2_4, advancedTo } = await initScenario({
			customerId: "set-plans-month-start-anchor",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
		});

		await expectStripeSubscriptionAnchorCorrect({
			customerId,
			anchorMs: nextMonthStartMs({ fromMs: advancedTo }),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans anchor: month-start plan starting at a numeric now anchors to the 1st")}`,
	async () => {
		const pro = anchoredToMonthStart(
			products.pro({
				items: [items.monthlyMessages({ includedUsage: 100 })],
			}),
		);

		const { customerId, autumnV2_4, advancedTo } = await initScenario({
			customerId: "set-plans-month-start-numeric",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [{ starts_at: advancedTo, plans: [{ plan_id: pro.id }] }],
		});

		await expectStripeSubscriptionAnchorCorrect({
			customerId,
			anchorMs: nextMonthStartMs({ fromMs: advancedTo }),
		});
	},
);

const setupLivePro = async ({ customerId }: { customerId: string }) => {
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
		actions: [s.billing.attach({ productId: pro.id })],
	});
	const live = await findStripeSubscriptionByStatus({
		ctx: scenario.ctx,
		customerId,
		status: "active",
	});
	return { ...scenario, pro, premium, live };
};

/** The same subscription carries the plans, and no second one was created beside it. */
const expectUpdatedInPlace = async ({
	ctx,
	subscriptionId,
}: {
	ctx: TestContext;
	subscriptionId: string;
}) => {
	const subscription =
		await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
	const { data } = await ctx.stripeCli.subscriptions.list({
		customer: subscription.customer as string,
	});
	expect(data.map((live) => live.id)).toEqual([subscriptionId]);
	return subscription;
};

test.concurrent(
	`${chalk.yellowBright("set-plans live: an active subscription is updated in place")}`,
	async () => {
		const { customerId, autumnV2_4, ctx, premium, live } = await setupLivePro({
			customerId: "set-plans-live-active",
		});

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: premium.id }] }],
		});

		await expectUpdatedInPlace({ ctx, subscriptionId: live.id });
		await expectCustomerProducts({ customerId, active: [premium.id] });
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans live: a past_due subscription is updated in place, not replaced")}`,
	async () => {
		const { customerId, autumnV2_4, ctx, pro, live, testClockId } =
			await setupLivePro({ customerId: "set-plans-live-past-due" });
		await driveProductPastDue({
			ctx,
			testClockId: testClockId!,
			customerId,
			productId: pro.id,
		});

		const setPlansParams = {
			customer_id: customerId,
			phases: [{ starts_at: "now" as const, plans: [{ plan_id: pro.id }] }],
		};
		const preview = await autumnV2_4.billing.previewSetPlans(setPlansParams);
		expect(preview.warnings.map((warning) => warning.type)).not.toContain(
			"subscription_replaced",
		);
		expectPreviewWarning({
			preview,
			type: "past_due_invoice_open",
			messageContains: ["Stripe keeps retrying it"],
		});
		await autumnV2_4.billing.setPlans(setPlansParams);

		const subscription = await expectUpdatedInPlace({
			ctx,
			subscriptionId: live.id,
		});
		expect(subscription.status).toBe("past_due");
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans live: pause_collection survives an in-place update")}`,
	async () => {
		const { customerId, autumnV2_4, ctx, premium, live } = await setupLivePro({
			customerId: "set-plans-live-pause-collection",
		});
		await ctx.stripeCli.subscriptions.update(live.id, {
			pause_collection: { behavior: "void" },
		});

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: premium.id }] }],
		});

		const subscription = await expectUpdatedInPlace({
			ctx,
			subscriptionId: live.id,
		});
		expect(subscription.pause_collection?.behavior).toBe("void");
	},
);
