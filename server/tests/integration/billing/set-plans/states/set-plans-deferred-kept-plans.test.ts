/**
 * A set_plans that keeps existing plans and adds one, deferred behind a payment,
 * finishes once the invoice is paid: the added plan is billed once and the schedule persists.
 *
 * Red (before): resuming rebuilt the schedule phases from the inserted rows only, so the kept
 *   plans made it throw after Stripe and Autumn had changed; webhook retries then re-billed the
 *   added plan (quantity 2 in prod) and the schedule never persisted.
 * Green (after): resuming persists the phases set_plans computed, so the first delivery completes.
 */

import { expect, test } from "bun:test";
import {
	customerProducts,
	ms,
	type SetPlansParamsV0Input,
	schedulePhases,
	schedules,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { asc, eq, inArray } from "drizzle-orm";

const SUCCESS_PAYMENT_METHOD = "pm_card_visa";

const payInvoice = async ({
	ctx,
	stripeInvoiceId,
}: {
	ctx: TestContext;
	stripeInvoiceId: string;
}) => {
	const invoice = await ctx.stripeCli.invoices.retrieve(stripeInvoiceId);
	const paymentMethod = await ctx.stripeCli.paymentMethods.attach(
		SUCCESS_PAYMENT_METHOD,
		{ customer: invoice.customer as string },
	);
	await ctx.stripeCli.invoices.pay(stripeInvoiceId, {
		payment_method: paymentMethod.id,
	});
};

/** Each persisted phase's product ids, in phase order. */
const persistedPhaseProductIds = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const phases = await ctx.db
		.select({ customerProductIds: schedulePhases.customer_product_ids })
		.from(schedulePhases)
		.innerJoin(schedules, eq(schedulePhases.schedule_id, schedules.id))
		.where(eq(schedules.customer_id, customerId))
		.orderBy(asc(schedulePhases.starts_at));

	const ids = phases.flatMap(({ customerProductIds }) => customerProductIds);
	const rows = ids.length
		? await ctx.db
				.select({
					id: customerProducts.id,
					productId: customerProducts.product_id,
				})
				.from(customerProducts)
				.where(inArray(customerProducts.id, ids))
		: [];
	const productIdOf = new Map(rows.map((row) => [row.id, row.productId]));

	return phases.map(({ customerProductIds }) =>
		customerProductIds.map((id) => productIdOf.get(id)).sort(),
	);
};

test.concurrent(
	`${chalk.yellowBright("set-plans deferred: keeping plans and adding one completes once the invoice is paid")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addon = products.recurringAddOn({
			items: [items.monthlyWords({ includedUsage: 50 })],
		});

		const { customerId, autumnV2_4, ctx, advancedTo } = await initScenario({
			customerId: "set-plans-deferred-kept",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.attachPaymentMethod({ type: "authenticate" }),
			],
		});

		const response = await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases: [
				{
					starts_at: "now",
					plans: [{ plan_id: pro.id }, { plan_id: addon.id }],
				},
				{
					starts_at: advancedTo + ms.days(45),
					plans: [{ plan_id: pro.id }],
				},
			],
		});
		expect(response.required_action).toBeDefined();
		const stripeInvoiceId = response.invoice?.stripe_id;
		if (!stripeInvoiceId) throw new Error("Expected a deferred invoice");

		await payInvoice({ ctx, stripeInvoiceId });

		await expectCustomerProducts({
			customerId,
			active: [pro.id, addon.id],
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });

		expect(await persistedPhaseProductIds({ ctx, customerId })).toEqual([
			[addon.id, pro.id].sort(),
			[pro.id],
		]);
	},
);
