/**
 * Invoice credits itemize at the plan item's rate. Each per-feature line is
 * credits × rate, "Credits applied" refunds the included credits at the same
 * rate, and the invoice total is overage × rate.
 *
 * Catalog rates (v2Features.ts): Action1 = 0.2 credits/unit, Action2 = 0.6 credits/unit.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const BASE_PRICE = 20;
const INCLUDED_CREDITS = 100;
const ACTION1_CREDITS_PER_UNIT = 0.2;
const ACTION2_CREDITS_PER_UNIT = 0.6;

const expectedInvoice = ({ usage, rate }: { usage: number; rate: number }) => {
	const action1Credits = usage * ACTION1_CREDITS_PER_UNIT;
	const action2Credits = usage * ACTION2_CREDITS_PER_UNIT;
	const overageCredits = Math.max(
		action1Credits + action2Credits - INCLUDED_CREDITS,
		0,
	);
	const creditsApplied = action1Credits + action2Credits - overageCredits;
	return {
		action1Amount: action1Credits * rate,
		action2Amount: action2Credits * rate,
		creditsApplied: creditsApplied * rate,
		total: BASE_PRICE + overageCredits * rate,
	};
};

for (const scenario of [
	{ name: "funded-tenth", usage: 50, price: 0.1, billingUnits: 1 },
	{ name: "overage-tenth", usage: 250, price: 0.1, billingUnits: 1 },
	{ name: "overage-per-hundred", usage: 250, price: 5, billingUnits: 100 },
]) {
	const rate = scenario.price / scenario.billingUnits;
	const expected = expectedInvoice({ usage: scenario.usage, rate });

	test.concurrent(
		`${chalk.yellowBright(`invoice.created invoice credit rate: ${scenario.name} bills credits at ${rate} per credit`)}`,
		async () => {
			const product = products.pro({
				id: `invoice-credit-rate-${scenario.name}`,
				items: [
					items.consumable({
						featureId: TestFeature.InvoiceCredits,
						includedUsage: INCLUDED_CREDITS,
						price: scenario.price,
						billingUnits: scenario.billingUnits,
					}),
				],
			});

			const { customerId, autumnV2_3 } = await initScenario({
				customerId: `invoice-credit-rate-${scenario.name}`,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [product] }),
				],
				actions: [
					s.billing.attach({ productId: product.id }),
					s.track({ featureId: TestFeature.Action1, value: scenario.usage }),
					s.track({ featureId: TestFeature.Action2, value: scenario.usage }),
					s.advanceToNextInvoice({ withPause: true }),
				],
			});

			const customer =
				await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
			const renewalInvoice = customer.invoices?.[0];
			expect(renewalInvoice?.stripe_id).toBeDefined();
			expect(renewalInvoice?.total).toBe(expected.total);

			await expectInvoiceLineItemsCorrect({
				stripeInvoiceId: renewalInvoice!.stripe_id,
				expectedCount: 4,
				expectedTotal: expected.total,
				expectedLineItems: [
					{ isBasePrice: true, direction: "charge", amount: BASE_PRICE },
					{
						featureId: TestFeature.Action1,
						direction: "charge",
						billingTiming: "in_arrear",
						amount: expected.action1Amount,
					},
					{
						featureId: TestFeature.Action2,
						direction: "charge",
						billingTiming: "in_arrear",
						amount: expected.action2Amount,
					},
					{
						featureId: TestFeature.InvoiceCredits,
						direction: "refund",
						billingTiming: "in_arrear",
						amount: -expected.creditsApplied,
					},
				],
			});
		},
		{ timeout: 120_000 },
	);
}
