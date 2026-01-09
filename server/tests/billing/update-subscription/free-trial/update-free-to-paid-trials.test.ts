import { expect, test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/billing/utils/expectCustomerProductTrialing";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Free-to-Paid with Trial Tests
 *
 * Tests for scenarios starting from free products and upgrading to paid with trial.
 * Uses `status === "trialing"` and `current_period_end` to verify trial state.
 */

// 1. Free to paid with `free_trial` param
test.concurrent(`${chalk.yellowBright("f2p-trial: add paid with free_trial param")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({ items: [messagesItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "f2p-trial-param",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [s.attach({ productId: "base" })],
	});

	// Track some usage before update
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 30,
		},
		{ timeout: 2000 },
	);

	const priceItem = items.monthlyPrice();

	const updateParams = {
		customer_id: customerId,
		product_id: free.id,
		items: [messagesItem, priceItem],
		free_trial: {
			length: 7,
			duration: FreeTrialDuration.Day,
			card_required: true,
			unique_fingerprint: false,
		},
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Preview total should be 0 during trial
	expect(preview.total).toEqual(0);

	// Verify preview has trial info
	expect(preview.autumn?.freeTrialPlan?.trialEndsAt).toBeDefined();

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is trialing (status = "trialing", current_period_end is trial end)
	await expectProductTrialing({
		customer,
		productId: free.id,
		trialEndsAfter: ms.days(6), // At least 6 days from now
		trialEndsBefore: ms.days(8), // At most 8 days from now
	});

	// Usage should be preserved
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage - 30,
		usage: 30,
	});

	// No immediate charge during trial
	expectCustomerInvoiceCorrect({
		customer,
		count: 1, // Just the $0 trial invoice
		latestTotal: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 2. Free to paid, product has trial config in plan, update while trial ongoing
test.concurrent(`${chalk.yellowBright("f2p-trial: product with trial config, update mid-trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 14,
	});

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "f2p-trial-mid-update",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	// Verify initially trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proTrial.id,
	});
	// Get initial trial end from current_period_end
	const initialTrialEnd = customerBefore.products?.find(
		(p) => p.id === proTrial.id,
	)?.current_period_end;
	expect(initialTrialEnd).toBeDefined();

	// Update mid-trial - change included usage (no free_trial param = keep existing trial)
	const updatedMessagesItem = items.monthlyMessages({ includedUsage: 200 });

	const updateParams = {
		customer_id: customerId,
		product_id: proTrial.id,
		items: [updatedMessagesItem, items.monthlyPrice()],
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should be 0 during trial
	expect(preview.total).toEqual(0);

	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Trial should be preserved
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
	});

	// Verify current_period_end (trial end) is approximately the same (allow some variance)
	const newTrialEnd = customer.products?.find(
		(p) => p.id === proTrial.id,
	)?.current_period_end;
	expect(newTrialEnd).toBeDefined();
	expect(Math.abs(newTrialEnd! - initialTrialEnd!)).toBeLessThan(60000); // Within 1 minute

	// Feature updated
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: updatedMessagesItem.included_usage,
		balance: updatedMessagesItem.included_usage,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// 3. Free to paid with trial, merging with existing subscription
test.concurrent(`${chalk.yellowBright("f2p-trial: merge with existing subscription")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

	const { customerId, autumnV1, ctx, entities } = await initScenario({
		customerId: "f2p-trial-merge",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: free.id, entityIndex: 1 }),
		],
	});

	// Verify entity 0 is on paid pro (not trialing)
	const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductActive({ customer: entity1, productId: pro.id });
	await expectProductNotTrialing({ customer: entity1, productId: pro.id });

	// Now upgrade entity 1 from free to paid with trial
	const priceItem = items.monthlyPrice();

	const updateParams = {
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: free.id,
		items: [messagesItem, priceItem],
		free_trial: {
			length: 7,
			duration: FreeTrialDuration.Day,
			card_required: true,
			unique_fingerprint: false,
		},
	};

	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);

	// Should be 0 during trial
	expect(preview.total).toEqual(0);

	// Verify preview has trial info
	expect(preview.autumn?.freeTrialPlan?.trialEndsAt).toBeDefined();

	await autumnV1.subscriptions.update(updateParams);

	// Verify entity 1 is now trialing
	const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
	await expectProductTrialing({
		customer: entity2,
		productId: free.id,
		trialEndsAfter: ms.days(6),
		trialEndsBefore: ms.days(8),
	});

	// Entity 0 should still not be trialing
	const entity1After = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductNotTrialing({
		customer: entity1After,
		productId: pro.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
