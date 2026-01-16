import { expect, test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
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
 * Update Trial Edge Cases Tests
 *
 * Tests for edge case scenarios involving products with prepaid/paid features and trial transitions.
 */

// 1. Start with users -> add trial -> update quantity -> remove trial
test.concurrent(`${chalk.yellowBright("trial-edge-cases: start with users, add trial, update quantity, remove trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const prepaidUsersItem = items.prepaidUsers({ includedUsage: 0 }); // $10/seat

	const pro = products.base({
		id: "pro",
		items: [messagesItem, priceItem, prepaidUsersItem],
	});

	const initialSeats = 3;
	const seatPrice = 10; // $10/seat

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "trial-edge-start-users",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Users, quantity: initialSeats }],
			}),
		],
	});

	// Step 1: Verify initial state - NOT trialing, has 3 users
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({
		customer: customerBefore,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerBefore,
		featureId: TestFeature.Users,
		includedUsage: initialSeats,
		balance: initialSeats,
		usage: 0,
	});

	// Initial invoice: $20 base + $30 (3 seats * $10) = $50
	const initialTotal = priceItem.price! + initialSeats * seatPrice;
	expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 1,
		latestTotal: initialTotal,
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

	// Should refund previous payment since entering trial (base price + 3 seats)
	expect(addTrialPreview.total).toEqual(-initialTotal);

	// next_cycle should show when trial ends (base price + 3 seats)
	expectPreviewNextCycleCorrect({
		preview: addTrialPreview,
		startsAt: advancedTo + ms.days(14),
		total: initialTotal,
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

	// Users should still have 3 seats
	expectCustomerFeatureCorrect({
		customer: customerWithTrial,
		featureId: TestFeature.Users,
		includedUsage: initialSeats,
		balance: initialSeats,
		usage: 0,
	});

	// Step 3: Update quantity to 5 seats while trialing
	const updatedSeats = 5;
	const updatedSeatsPrice = updatedSeats * seatPrice; // $50

	const updateQuantityParams = {
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Users, quantity: updatedSeats }],
	};

	const updateQuantityPreview =
		await autumnV1.subscriptions.previewUpdate(updateQuantityParams);

	// Should be $0 during trial (seats are free during trial)
	expect(updateQuantityPreview.total).toEqual(0);

	// next_cycle should show when trial ends (base price + 5 seats)
	expectPreviewNextCycleCorrect({
		preview: updateQuantityPreview,
		startsAt: advancedTo + ms.days(14),
		total: priceItem.price! + updatedSeatsPrice,
	});

	await autumnV1.subscriptions.update(updateQuantityParams);

	const customerAfterQuantityUpdate =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should still be trialing
	await expectProductTrialing({
		customer: customerAfterQuantityUpdate,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Users should now have 5 seats
	expectCustomerFeatureCorrect({
		customer: customerAfterQuantityUpdate,
		featureId: TestFeature.Users,
		includedUsage: updatedSeats,
		balance: updatedSeats,
		usage: 0,
	});

	// Step 4: Update plan to remove the trial
	const removeTrialParams = {
		customer_id: customerId,
		product_id: pro.id,
		free_trial: null,
	};

	const removeTrialPreview =
		await autumnV1.subscriptions.previewUpdate(removeTrialParams);

	// Should charge full price since trial is being removed (base price + 5 seats)
	const finalTotal = priceItem.price! + updatedSeatsPrice;
	expect(removeTrialPreview.total).toEqual(finalTotal);

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

	// Users should still have 5 seats
	expectCustomerFeatureCorrect({
		customer: customerAfterRemove,
		featureId: TestFeature.Users,
		includedUsage: updatedSeats,
		balance: updatedSeats,
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

	// Invoice count: 1 (initial $50) + 1 (refund -$50) + 1 (charge $70) = 3 invoices
	// Latest invoice should be $70 (base $20 + 5 seats * $10)
	expectCustomerInvoiceCorrect({
		customer: customerAfterRemove,
		count: 5,
		latestTotal: finalTotal,
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
