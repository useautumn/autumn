import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductTrialing } from "@tests/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Quantity Updates with Trial Tests
 *
 * Tests for quantity updates (prepaid, allocated) when a subscription is trialing.
 * Uses `status === "trialing"` and `current_period_end` to verify trial state.
 */

// 1. Update prepaid quantity while trialing
test.concurrent(`${chalk.yellowBright("trial-qty: update prepaid quantity while trialing")}`, async () => {
	const prepaidItem = items.prepaidMessages({ includedUsage: 0 });

	const proTrial = products.proWithTrial({
		items: [prepaidItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "trial-qty-prepaid",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.attach({
				productId: proTrial.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Verify initially trialing
	await expectProductTrialing({
		customerId,
		productId: proTrial.id,
	});

	// Initial balance should be 100 (prepaid quantity)
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerBefore.features[TestFeature.Messages].balance).toEqual(100);

	// Update prepaid quantity to 200 while trialing
	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	expect(preview.total).toEqual(0);

	// next_cycle should align with existing 14-day trial
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14),
	});

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Trial should still be active
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
	});

	// Balance should be updated to 200
	expect(customer.features[TestFeature.Messages].balance).toEqual(200);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: preview.total,
	});
});
