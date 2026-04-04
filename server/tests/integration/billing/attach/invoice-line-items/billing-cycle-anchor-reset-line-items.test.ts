import { expect, test } from "bun:test";
import type { ApiCustomerV3, AttachParamsV0Input } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { calculateResetBillingCycleNowTotal } from "@tests/integration/billing/utils/proration";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { timeout } from "@/utils/genUtils";

test.concurrent(`${chalk.yellowBright("billing-cycle-anchor-line-items 1: pro to premium reset stores invoice line items")}`, async () => {
	const customerId = "attach-anchor-line-items";
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.advanceTestClock({ days: 14 }),
		],
	});

	const expectedTotal = await calculateResetBillingCycleNowTotal({
		customerId,
		advancedTo,
		oldAmount: 20,
		newAmount: 50,
	});

	const preview = await autumnV1.billing.previewAttach<AttachParamsV0Input>({
		customer_id: customerId,
		product_id: premium.id,
		billing_cycle_anchor: "now",
	});
	expect(preview.total).toBeCloseTo(expectedTotal, 0);

	const result = await autumnV1.billing.attach<AttachParamsV0Input>({
		customer_id: customerId,
		product_id: premium.id,
		billing_cycle_anchor: "now",
		redirect_mode: "if_required",
	});

	expect(result.invoice).toBeDefined();
	expect(result.invoice?.total).toBeCloseTo(preview.total, 0);

	await timeout(2000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: preview.total,
	});

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: result.invoice!.stripe_id,
		expectedLineItems: [
			{
				isBasePrice: true,
				direction: "refund",
				productId: pro.id,
				minCount: 1,
			},
			{
				isBasePrice: true,
				direction: "charge",
				productId: premium.id,
				minCount: 1,
			},
		],
	});
});

test.concurrent(`${chalk.yellowBright("billing-cycle-anchor-li 1: entity prepaid upgrade stores line items")}`, async () => {
	const customerId = "anchor-li-entity-upgrade";

	const pro = products.pro({
		id: "pro-li-entity",
		items: [
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
				price: 10,
			}),
		],
	});

	const premium = products.premium({
		id: "premium-li-entity",
		items: [
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
				price: 15,
			}),
		],
	});

	const { autumnV1, entities, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				entityIndex: 0,
				options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
			}),
			s.advanceTestClock({ days: 14 }),
		],
	});

	const expectedTotal = await calculateResetBillingCycleNowTotal({
		customerId,
		advancedTo,
		oldAmount: 40,
		newAmount: 110,
	});

	const preview = await autumnV1.billing.previewAttach<AttachParamsV0Input>({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
		billing_cycle_anchor: "now",
	});
	expect(preview.total).toBeCloseTo(expectedTotal, 0);

	const result = await autumnV1.billing.attach<AttachParamsV0Input>({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entities[0].id,
		options: [{ feature_id: TestFeature.Messages, quantity: 500 }],
		billing_cycle_anchor: "now",
		redirect_mode: "if_required",
	});

	expect(result.invoice).toBeDefined();
	expect(result.invoice?.total).toBeCloseTo(preview.total, 0);

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: result.invoice!.stripe_id,
		expectedLineItems: [
			{
				isBasePrice: true,
				direction: "refund",
				productId: pro.id,
				minCount: 1,
			},
			{
				featureId: TestFeature.Messages,
				direction: "refund",
				productId: pro.id,
				minCount: 1,
			},
			{
				isBasePrice: true,
				direction: "charge",
				productId: premium.id,
				minCount: 1,
			},
			{
				featureId: TestFeature.Messages,
				direction: "charge",
				productId: premium.id,
				minCount: 1,
			},
		],
	});
});
