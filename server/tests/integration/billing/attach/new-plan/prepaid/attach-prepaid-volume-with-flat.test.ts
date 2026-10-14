import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("attach-prepaid-volume-flat: flat_amount only")}`, async () => {
	const customerId = "vol-flat-only-attach";
	const quantity = 50;

	const expectedTotal = 20;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: 1,
		tiers: [
			{ to: 100, amount: 0, flat_amount: 20 },
			{ to: "inf", amount: 0, flat_amount: 50 },
		],
	});

	const product = products.base({
		id: "vol-flat-only",
		items: [volumeItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(preview.total).toBe(expectedTotal);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: product.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("attach-prepaid-volume-flat: mixed per-unit + flat_amount")}`, async () => {
	const customerId = "vol-flat-mixed-attach";
	const quantity = 50;

	const expectedTotal = 60;

	const volumeItem = items.volumePrepaidMessages({
		includedUsage: 0,
		billingUnits: 1,
		tiers: [
			{ to: 100, amount: 1, flat_amount: 10 },
			{ to: "inf", amount: 0.5, flat_amount: 25 },
		],
	});

	const product = products.base({
		id: "vol-flat-mixed",
		items: [volumeItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product] }),
		],
		actions: [],
	});

	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});
	expect(preview.total).toBe(expectedTotal);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: product.id,
		options: [{ feature_id: TestFeature.Messages, quantity }],
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({ customer, productId: product.id });

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: quantity,
		usage: 0,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
