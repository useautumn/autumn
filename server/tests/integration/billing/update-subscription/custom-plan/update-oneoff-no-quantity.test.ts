import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// ONE-OFF PREPAID WITH NO QUANTITY ON CUSTOM PLAN UPDATE
//
// When a product has both monthly metered items and a one-off prepaid item,
// updating the plan (e.g. increasing monthly included usage) should NOT require
// passing feature_quantities for the one-off prepaid.
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("custom-plan: increase monthly usage with one-off prepaid present (no quantity)")}`, async () => {
	const monthlyMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const oneOffMessagesItem = items.oneOffMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const pro = products.pro({
		items: [monthlyMessagesItem, oneOffMessagesItem],
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "oneoff-no-qty-update",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const updatedMonthlyMessagesItem = items.monthlyMessages({
		includedUsage: 200,
	});
	const monthlyPriceItem = items.monthlyPrice();

	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [updatedMonthlyMessagesItem, monthlyPriceItem, oneOffMessagesItem],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toBe(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
