import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("free-to-free: anchor drifts after multiple updates (regression)")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx, testClockId } = await initScenario({
		customerId: "f2f-anchor-drift",
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: "base" })],
	});

	const messagesUsage = 20;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 2000 },
	);

	const customerInitial =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const originalResetAt =
		customerInitial.features[TestFeature.Messages].next_reset_at;
	expect(originalResetAt).toBeDefined();

	const originalStartedAt = customerInitial.products[0].started_at;
	expect(originalStartedAt).toBeDefined();

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 3,
	});

	const update1Items = items.monthlyMessages({ includedUsage: 150 });
	const update1Params = {
		customer_id: customerId,
		product_id: free.id,
		items: [update1Items],
	};

	const preview1 = await autumnV1.subscriptions.previewUpdate(update1Params);
	expect(preview1.total).toEqual(0);

	await autumnV1.subscriptions.update(update1Params);

	const customerAfter1 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer: customerAfter1,
		featureId: TestFeature.Messages,
		includedUsage: 150,
		balance: 150 - messagesUsage,
		usage: messagesUsage,
		resetsAt: originalResetAt!,
	});

	expect(customerAfter1.products[0].started_at).toEqual(originalStartedAt);

	expectCustomerInvoiceCorrect({
		customer: customerAfter1,
		count: 0,
	});

	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 3,
	});

	const update2Items = items.monthlyMessages({ includedUsage: 200 });
	const update2Params = {
		customer_id: customerId,
		product_id: free.id,
		items: [update2Items],
	};

	const preview2 = await autumnV1.subscriptions.previewUpdate(update2Params);
	expect(preview2.total).toEqual(0);

	await autumnV1.subscriptions.update(update2Params);

	const customerAfter2 =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	expectCustomerFeatureCorrect({
		customer: customerAfter2,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200 - messagesUsage,
		usage: messagesUsage,
		resetsAt: originalResetAt!,
	});

	expect(customerAfter2.products[0].started_at).toEqual(originalStartedAt);

	expectCustomerInvoiceCorrect({
		customer: customerAfter2,
		count: 0,
	});

	await expectProductActive({
		customer: customerAfter2,
		productId: free.id,
	});
});
