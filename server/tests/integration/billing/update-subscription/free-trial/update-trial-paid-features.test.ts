import { expect, test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Update Trial with Paid Features Tests
 *
 * Tests for scenarios involving products with prepaid/paid features and trial transitions.
 */

// 1. Pro product with prepaid users -> add trial -> remove trial
test.concurrent(`${chalk.yellowBright("trial-paid-features: prepaid users add trial then remove")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const prepaidUsersItem = items.prepaidUsers({ includedUsage: 5 });

	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem, prepaidUsersItem],
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "trial-prepaid-add-remove",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Users, quantity: 3 }],
			}),
		],
	});

	return;

	// Verify initial state - NOT trialing, has users
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({
		customer: customerBefore,
		productId: pro.id,
	});

	// Prepaid users: 5 included + 3 purchased = 8 total
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: 5,
		balance: 8,
		usage: 0,
	});

	// Step 2: Update plan to start a free trial
	const addTrialParams = {
		customer_id: customerId,
		product_id: pro.id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
			card_required: true,
			unique_fingerprint: false,
		},
	};

	const addTrialPreview =
		await autumnV1.subscriptions.previewUpdate(addTrialParams);

	// Should refund previous payment since entering trial
	expect(addTrialPreview.total).toBeLessThanOrEqual(0);

	// next_cycle should show when trial ends
	expectPreviewNextCycleCorrect({
		preview: addTrialPreview,
		startsAt: advancedTo + ms.days(14),
		total: priceItem.price!,
	});

	await autumnV1.subscriptions.update(addTrialParams);

	const customerWithTrial =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should now be trialing
	await expectProductTrialing({
		customer: customerWithTrial,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Users should still be accessible
	expectCustomerFeatureCorrect({
		customer: customerWithTrial,
		featureId: TestFeature.Users,
		includedUsage: 5,
		balance: 8,
		usage: 0,
	});

	// Messages should still be accessible
	expectCustomerFeatureCorrect({
		customer: customerWithTrial,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	// Step 3: Update plan to remove the trial
	const removeTrialParams = {
		customer_id: customerId,
		product_id: pro.id,
		free_trial: null,
	};

	const removeTrialPreview =
		await autumnV1.subscriptions.previewUpdate(removeTrialParams);

	// Should charge full price since trial is being removed
	expect(removeTrialPreview.total).toEqual(priceItem.price);

	// When trial is removed, next_cycle should not be defined (billing starts now)
	expectPreviewNextCycleCorrect({
		preview: removeTrialPreview,
		expectDefined: false,
	});

	await autumnV1.subscriptions.update(removeTrialParams, { timeout: 5000 });

	const customerAfterRemove =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should no longer be trialing
	await expectProductNotTrialing({
		customer: customerAfterRemove,
		productId: pro.id,
	});

	// Should now be active (not trialing)
	await expectProductActive({
		customer: customerAfterRemove,
		productId: pro.id,
	});

	// Users should still be accessible with same balance
	expectCustomerFeatureCorrect({
		customer: customerAfterRemove,
		featureId: TestFeature.Users,
		includedUsage: 5,
		balance: 8,
		usage: 0,
	});

	// Messages should still be accessible
	expectCustomerFeatureCorrect({
		customer: customerAfterRemove,
		featureId: TestFeature.Messages,
		includedUsage: messagesItem.included_usage,
		balance: messagesItem.included_usage,
		usage: 0,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: {
			checkNotTrialing: true,
		},
	});
});
