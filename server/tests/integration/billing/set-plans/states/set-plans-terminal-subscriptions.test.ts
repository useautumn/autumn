// set_plans treats a terminal Stripe subscription as gone and bills afresh.

import { expect, test } from "bun:test";
import { findActiveCustomerProductById, ms } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { timeout } from "@/utils/genUtils";

const WEBHOOK_SETTLE_MS = 12_000;

const getActiveProduct = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const customerProduct = findActiveCustomerProductById({
		fullCus: fullCustomer,
		productId,
	});
	if (!customerProduct) throw new Error(`No active ${productId}`);
	return { customerProduct, stripeCustomerId: fullCustomer.processor?.id };
};

/** Autumn's row points at the expired subscription, as when its bookkeeping never ran. */
const linkProductToExpiredSubscription = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
}) => {
	const { customerProduct, stripeCustomerId } = await getActiveProduct({
		ctx,
		customerId,
		productId,
	});
	const { data } = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		status: "incomplete_expired",
	});
	const expiredSubscriptionId = data[0]?.id;
	if (!expiredSubscriptionId) throw new Error("No incomplete_expired sub");

	await CusProductService.update({
		ctx,
		cusProductId: customerProduct.id,
		updates: { subscription_ids: [expiredSubscriptionId] },
	});
	await ctx.stripeCli.subscriptions.cancel(
		customerProduct.subscription_ids![0]!,
	);
	await timeout(WEBHOOK_SETTLE_MS);

	return { expiredSubscriptionId };
};

test.concurrent(
	`${chalk.yellowBright("set-plans terminal: incomplete_expired subscription is replaced by a new one")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customerId, autumnV2_4, ctx } = await initScenario({
			customerId: "set-plans-incomplete-expired",
			setup: [
				s.customer({ paymentMethod: "fail" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ hours: 25 }),
				s.attachPaymentMethod({ type: "success" }),
				s.billing.attach({ productId: pro.id }),
			],
		});

		const { expiredSubscriptionId } = await linkProductToExpiredSubscription({
			ctx,
			customerId,
			productId: pro.id,
		});

		const response = await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
		});
		expect(response.status).toBe("created");

		await expectCustomerProducts({ customerId, active: [pro.id] });
		const { customerProduct } = await getActiveProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(customerProduct.subscription_ids).not.toContain(
			expiredSubscriptionId,
		);
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

/** Cancels the subscription while Autumn's rows are unlinked, so they keep stale ids. */
const cancelSubscriptionMissingWebhook = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const { customer_products: customerProducts } = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const subscriptionId = customerProducts[0]?.subscription_ids?.[0];
	if (!subscriptionId) throw new Error("No linked subscription");

	for (const customerProduct of customerProducts) {
		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates: { subscription_ids: [], scheduled_ids: [] },
		});
	}
	await ctx.stripeCli.subscriptions.cancel(subscriptionId);
	await timeout(WEBHOOK_SETTLE_MS);

	for (const customerProduct of customerProducts) {
		await CusProductService.update({
			ctx,
			cusProductId: customerProduct.id,
			updates: {
				subscription_ids: customerProduct.subscription_ids,
				scheduled_ids: customerProduct.scheduled_ids,
			},
		});
	}
};

test.concurrent(
	`${chalk.yellowBright("set-plans terminal: stale schedule ids on a canceled subscription don't count as a live schedule")}`,
	async () => {
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 10 })],
		});
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { customerId, autumnV2_4, ctx, advancedTo } = await initScenario({
			customerId: "set-plans-stale-schedule-ids",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, premium] }),
			],
			actions: [],
		});

		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [
				{ starts_at: "now", plans: [{ plan_id: pro.id }] },
				{
					starts_at: advancedTo + ms.days(30),
					plans: [{ plan_id: premium.id }],
				},
			],
		});
		await cancelSubscriptionMissingWebhook({ ctx, customerId });

		await expectAutumnError({
			errMessage:
				"Past first phase starts_at is only supported for paid recurring plans.",
			func: () =>
				autumnV2_4.billing.setPlans({
					customer_id: customerId,
					phases: [
						{
							starts_at: advancedTo - ms.days(5),
							plans: [{ plan_id: free.id }],
						},
					],
				}),
		});
	},
);
