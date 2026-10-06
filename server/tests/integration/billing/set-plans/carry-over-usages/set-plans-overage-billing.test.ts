/** set_plans must not bill overage accrued on the plan it replaces (reported 2026-10-06).
 * Pro: $20/mo, 100 messages included, $0.10 per message over; 150 tracked = $5 overage. */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, SetPlansParamsV0Input } from "@autumn/shared";
import { findStripeSubscriptionByStatus } from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const setupProInOverage = async ({ customerId }: { customerId: string }) => {
	const pro = products.pro({
		id: "pro",
		items: [items.consumableMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.consumableMessages({ includedUsage: 500 })],
	});

	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 150, timeout: 2000 }),
		],
	});

	return { ...scenario, pro, premium };
};

/** Lines on the customer's latest Stripe invoice that bill messages usage. */
const latestInvoiceMessagesLines = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const subscription = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "active",
	});
	const { data } = await ctx.stripeCli.invoices.list({
		customer: subscription.customer as string,
		limit: 1,
	});
	return (data[0]?.lines.data ?? [])
		.filter((line) => /messages/i.test(line.description ?? ""))
		.map((line) => ({ description: line.description, amount: line.amount }));
};

test.concurrent(
	`${chalk.yellowBright("set-plans overage 1: switching plans does not bill the outgoing plan's overage")}`,
	async () => {
		const customerId = "set-plans-overage-switch";
		const { autumnV1, autumnV2_2, ctx, premium } = await setupProInOverage({
			customerId,
		});

		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: premium.id }] }],
		};

		const preview = await autumnV2_2.billing.previewSetPlans(params);
		await autumnV2_2.billing.setPlans(params);

		// Only the plan difference ($50 - $20 = $30) is billed, not the $5 overage.
		expect({
			previewTotal: preview.total,
			previewMessagesLines: preview.line_items.filter(
				(lineItem) => lineItem.feature_id === TestFeature.Messages,
			),
			invoiceMessagesLines: await latestInvoiceMessagesLines({
				ctx,
				customerId,
			}),
		}).toEqual({
			previewTotal: 30,
			previewMessagesLines: [],
			invoiceMessagesLines: [],
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 2,
			latestTotal: 30,
		});
		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customer.products.map((product) => product.id)).toContain(
			premium.id,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans overage 2: re-listing the current plan does not bill overage")}`,
	async () => {
		const customerId = "set-plans-overage-relist";
		const { autumnV1, autumnV2_2, ctx, pro } = await setupProInOverage({
			customerId,
		});

		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
		};

		const preview = await autumnV2_2.billing.previewSetPlans(params);
		expect(preview.total).toBe(0);

		await autumnV2_2.billing.setPlans(params);

		expect(await latestInvoiceMessagesLines({ ctx, customerId })).toEqual([]);
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 1,
			latestTotal: 20,
		});
	},
);
