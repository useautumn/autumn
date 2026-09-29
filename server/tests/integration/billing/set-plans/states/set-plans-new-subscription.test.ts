/** A customer with no Stripe subscription gets a new one, charged now with a card or through Checkout without one. */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

const SUBSCRIPTION_STATE_WARNINGS = [
	"subscription_replaced",
	"new_stripe_subscription",
];

const liveStripeSubscriptions = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const stripeCustomerId = (
		await CusService.getFull({ ctx, idOrInternalId: customerId })
	).processor?.id;
	if (!stripeCustomerId) return [];
	const { data } = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
	});
	return data;
};

test.concurrent(
	`${chalk.yellowBright("set-plans new: with a card, one new subscription is created and charged now")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId, autumnV1, autumnV2_4, ctx } = await initScenario({
			customerId: "set-plans-new-with-card",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const setPlansParams = {
			customer_id: customerId,
			phases: [{ starts_at: "now" as const, plans: [{ plan_id: pro.id }] }],
		};
		const preview = await autumnV2_4.billing.previewSetPlans(setPlansParams);
		expect(
			preview.warnings.filter((warning) =>
				SUBSCRIPTION_STATE_WARNINGS.includes(warning.type),
			),
		).toEqual([]);
		await autumnV2_4.billing.setPlans(setPlansParams);

		expect(await liveStripeSubscriptions({ ctx, customerId })).toHaveLength(1);
		await expectCustomerProducts({ customerId, active: [pro.id] });
		await expectCustomerInvoiceCorrect({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			count: 1,
			latestStatus: "paid",
			latestTotal: 20,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans new: without a card, a Checkout URL is returned and no subscription exists yet")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId, autumnV2_4, ctx } = await initScenario({
			customerId: "set-plans-new-no-card",
			setup: [s.customer({}), s.products({ list: [pro] })],
			actions: [],
		});

		const response = await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
		});

		expect(response.payment_url).toContain("checkout.stripe.com");
		expect(await liveStripeSubscriptions({ ctx, customerId })).toEqual([]);
		await expectCustomerProducts({ customerId, notPresent: [pro.id] });
	},
);
