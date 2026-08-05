import { expect, test } from "bun:test";
import { type ApiCustomerV5, CustomerExpand, sumValues } from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { addMonths } from "date-fns";

const BASE_PRICE = 20;
const PREPAID_PACKS = 2;
const PREPAID_PACK_PRICE = 10;
const MESSAGES_INCLUDED = 100;
const MESSAGES_TRACKED = 150;
const MESSAGES_OVERAGE_PRICE = 0.1;

test.concurrent(
	`${chalk.yellowBright("get-customer: invoice_previews returns the upcoming invoice per subscription")}`,
	async () => {
		const messagesItem = items.consumableMessages({
			includedUsage: MESSAGES_INCLUDED,
			price: MESSAGES_OVERAGE_PRICE,
		});
		const wordsItem = items.prepaid({
			featureId: TestFeature.Words,
			includedUsage: 0,
			billingUnits: 100,
			price: PREPAID_PACK_PRICE,
		});
		const pro = products.pro({
			id: "invoice-previews-pro",
			items: [messagesItem, wordsItem],
		});

		const customerId = "get-customer-invoice-previews";

		const { autumnV2_2, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Words, quantity: 200 }],
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: MESSAGES_TRACKED,
					timeout: 2000,
				}),
			],
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
			expand: [CustomerExpand.InvoicePreviews],
		});

		const previews = customer.invoice_previews;
		expect(previews).toBeDefined();
		expect(previews).toHaveLength(1);

		const [preview] = previews!;
		expect(preview.subscription_id).toStartWith("sub_");
		expect(preview.plan_ids).toContain(pro.id);
		expect(preview.currency).toBe("usd");

		// The upcoming invoice lands on the next cycle boundary.
		expect(preview.invoice_at).toBeCloseTo(
			addMonths(advancedTo, 1).getTime(),
			-6,
		);

		const basePriceLine = preview.line_items.find(
			(lineItem) => lineItem.feature_id === null,
		);
		expect(basePriceLine?.subtotal).toBe(BASE_PRICE);

		const prepaidLine = preview.line_items.find(
			(lineItem) => lineItem.feature_id === TestFeature.Words,
		);
		expect(prepaidLine?.subtotal).toBe(PREPAID_PACKS * PREPAID_PACK_PRICE);

		// Usage accrued this cycle is billed in arrear on the same invoice.
		const overage = MESSAGES_TRACKED - MESSAGES_INCLUDED;
		const usageLine = preview.line_items.find(
			(lineItem) => lineItem.feature_id === TestFeature.Messages,
		);
		expect(usageLine?.subtotal).toBeCloseTo(
			overage * MESSAGES_OVERAGE_PRICE,
			2,
		);
		expect(usageLine?.quantity).toBe(MESSAGES_TRACKED);

		expect(preview.total).toBeCloseTo(
			sumValues(preview.line_items.map((lineItem) => lineItem.total)),
			2,
		);
		expect(preview.subtotal).toBeCloseTo(
			sumValues(preview.line_items.map((lineItem) => lineItem.subtotal)),
			2,
		);

		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("get-customer: invoice_previews still shows the final usage invoice when cancelling")}`,
	async () => {
		const messagesItem = items.consumableMessages({
			includedUsage: MESSAGES_INCLUDED,
			price: MESSAGES_OVERAGE_PRICE,
		});
		const pro = products.pro({
			id: "invoice-previews-cancel-pro",
			items: [messagesItem],
		});

		const customerId = "get-customer-invoice-previews-cancel";

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: MESSAGES_TRACKED,
					timeout: 2000,
				}),
				s.updateSubscription({
					productId: pro.id,
					cancelAction: "cancel_end_of_cycle",
				}),
			],
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
			expand: [CustomerExpand.InvoicePreviews],
		});

		// Nothing recurs past the boundary, but the accrued overage is still billed.
		expect(customer.invoice_previews).toHaveLength(1);

		const [preview] = customer.invoice_previews!;
		const overage = MESSAGES_TRACKED - MESSAGES_INCLUDED;

		expect(preview.total).toBeCloseTo(overage * MESSAGES_OVERAGE_PRICE, 2);
		expect(
			preview.line_items.every(
				(lineItem) => lineItem.feature_id === TestFeature.Messages,
			),
		).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("get-customer: invoice_previews absent unless expanded")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const pro = products.pro({
			id: "invoice-previews-unexpanded-pro",
			items: [messagesItem],
		});

		const customerId = "get-customer-invoice-previews-unexpanded";

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

		expect(customer.invoice_previews).toBeUndefined();
	},
);
