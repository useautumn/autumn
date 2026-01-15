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

// 1. Pro product with prepaid users (0 seats) -> add trial -> update quantity to 5 seats
test.concurrent(`${chalk.yellowBright("trial-paid-features: add trial then update quantity")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const prepaidUsersItem = items.prepaidUsers({ includedUsage: 0 }); // $10/seat

	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem, prepaidUsersItem],
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "trial-prepaid-add-update-qty",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Users, quantity: 0 }],
			}),
		],
	});

	// Verify initial state - NOT trialing, 0 seats
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({
		customer: customerBefore,
		productId: pro.id,
	});

	// Prepaid users: 0 included + 0 purchased = 0 total
	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: 0,
		balance: 0,
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

	// Should refund previous payment since entering trial (base price only, 0 seats)
	expect(addTrialPreview.total).toEqual(-priceItem.price!);

	// next_cycle should show when trial ends (base price only, 0 seats)
	expectPreviewNextCycleCorrect({
		preview: addTrialPreview,
		startsAt: advancedTo + ms.days(14),
		total: priceItem.price!,
	});

	await autumnV1.subscriptions.update(addTrialParams);

	return;

	const customerWithTrial =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should now be trialing
	await expectProductTrialing({
		customer: customerWithTrial,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Users should still be 0
	expectCustomerFeatureCorrect({
		customer: customerWithTrial,
		featureId: TestFeature.Users,
		includedUsage: 0,
		balance: 0,
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

	// Step 3: Update quantity to 5 seats while trialing
	const seatsQuantity = 5;
	const seatsPrice = seatsQuantity * 10; // $10/seat = $50

	const updateQuantityParams = {
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Users, quantity: seatsQuantity }],
	};

	const updateQuantityPreview =
		await autumnV1.subscriptions.previewUpdate(updateQuantityParams);

	// Should be $0 during trial (seats are free during trial)
	expect(updateQuantityPreview.total).toEqual(0);

	// next_cycle should show when trial ends (base price + 5 seats)
	expectPreviewNextCycleCorrect({
		preview: updateQuantityPreview,
		startsAt: advancedTo + ms.days(14),
		total: priceItem.price! + seatsPrice,
	});

	await autumnV1.subscriptions.update(updateQuantityParams);
	return;

	const customerAfterQuantityUpdate =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should still be trialing
	await expectProductTrialing({
		customer: customerAfterQuantityUpdate,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Should now be active (trialing)
	await expectProductActive({
		customer: customerAfterQuantityUpdate,
		productId: pro.id,
	});

	// Users should now have 5 seats
	expectCustomerFeatureCorrect({
		customer: customerAfterQuantityUpdate,
		featureId: TestFeature.Users,
		includedUsage: 0,
		balance: seatsQuantity,
		usage: 0,
	});

	// Messages should still be accessible
	expectCustomerFeatureCorrect({
		customer: customerAfterQuantityUpdate,
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
	});
});
