/**
 * Free Trial Features Tests (Attach V2)
 *
 * Tests for prepaid, allocated, and consumable features during trials.
 *
 * Key behaviors:
 * - Prepaid items: Balance available during trial, no charge until trial ends
 * - Allocated seats: Seats available during trial, prorated charge after trial
 * - Consumable (arrears): Usage tracked, billed at trial end
 * - Feature balance is available during trial period
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Prepaid messages during trial
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer attaches product with prepaid messages and trial
 * - Product includes: 100 included messages, prepaid at $10/100 messages
 * - Customer uses some prepaid messages during trial
 *
 * Expected Result:
 * - Balance is available during trial
 * - Balance decreases as used
 * - No charge during trial
 */
test.concurrent(`${chalk.yellowBright("trial-features 1: prepaid messages during trial")}`, async () => {
	const customerId = "trial-feat-prepaid-messages";

	const prepaidItem = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const priceItem = items.monthlyPrice({ price: 20 });
	const productWithTrial = products.base({
		id: "prepaid-trial",
		items: [prepaidItem, priceItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [productWithTrial] }),
		],
		actions: [],
	});

	// 1. Preview attach with quantity - should show $0 during trial, next_cycle shows base + prepaid
	// quantity becomes the new includedUsage, so 200 - 100 original = 1 pack to purchase
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: productWithTrial.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(7), // Trial end
		total: 30, // Base ($20) + 1 pack x $10 = $30 after trial
	});

	// 2. Attach product with prepaid
	// quantity becomes the new includedUsage (200), so 1 pack purchased
	await autumnV1.billing.attach(
		{
			customer_id: customerId,
			product_id: productWithTrial.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			redirect_mode: "if_required",
		},
		{
			timeout: 5000,
		},
	);

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is trialing
	await expectProductTrialing({
		customer,
		productId: productWithTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Verify prepaid balance is available
	// quantity (200) becomes the new includedUsage and balance
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// Verify $0 invoice during trial (Stripe creates invoice for trial subscriptions)
	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 0,
	});

	// 3. Track some usage during trial
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 50,
	});
	await new Promise((r) => setTimeout(r, 2000));

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify balance decreased (200 - 50 = 150)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 150,
		usage: 50,
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkTrialing: true },
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Allocated seats during trial
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer attaches product with allocated seats and trial
 * - Product includes: 3 included seats, $10/seat overage
 * - Customer tracks seat usage during trial (5 seats - 2 over included)
 *
 * Expected Result:
 * - Seats are available during trial
 * - Seat usage tracked with overage
 * - No charge during trial (prorated charge happens at trial end)
 */
test.concurrent(`${chalk.yellowBright("trial-features 2: allocated seats during trial")}`, async () => {
	const customerId = "trial-feat-allocated-seats";

	const seatsItem = items.allocatedUsers({ includedUsage: 3 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const productWithTrial = products.base({
		id: "seats-trial",
		items: [seatsItem, priceItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [productWithTrial] }),
		],
		actions: [],
	});

	// 1. Preview attach - should show $0 during trial, next_cycle shows base price
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: productWithTrial.id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(7), // Trial end
		total: 20, // Base price after trial
	});

	// 2. Attach product with allocated seats
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: productWithTrial.id,
		redirect_mode: "if_required",
	});

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is trialing
	await expectProductTrialing({
		customer,
		productId: productWithTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Verify seats are available
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: 3,
		usage: 0,
	});

	// Verify $0 invoice during trial (Stripe creates invoice for trial subscriptions)
	expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 0,
	});

	// 3. Track seat usage (set to 5 seats - 2 over included)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 5,
	});
	await new Promise((r) => setTimeout(r, 5000));

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify seat usage is tracked
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: -2, // 3 included - 5 used = -2 overage
		usage: 5,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 0,
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkTrialing: true },
	});

	const advancedToAfter = await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is NOT trialing
	await expectProductNotTrialing({
		customer,
		productId: productWithTrial.id,
		nowMs: advancedToAfter,
	});

	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: 20 + 2 * 10, // Base price + 2 seats x $10/seat
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 3,
		balance: -2, // 3 included - 5 used = -2 overage
		usage: 5,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Consumable (arrears) during trial
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer attaches product with consumable messages and trial
 * - Product includes: 100 included, $0.10/message overage
 * - Customer tracks usage to overage during trial (150 used = 50 overage)
 * - Trial ends
 *
 * Expected Result:
 * - Usage is tracked during trial
 * - After trial ends: consumable does NOT reset, overage is NOT charged
 * - Invoice only contains base price ($20)
 */
test.concurrent(`${chalk.yellowBright("trial-features 3: consumable (arrears) during trial")}`, async () => {
	const customerId = "trial-feat-consumable";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const productWithTrial = products.base({
		id: "consumable-trial",
		items: [consumableItem, priceItem],
		trialDays: 7,
	});

	const { autumnV1, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [productWithTrial] }),
		],
		actions: [],
	});

	// 1. Preview attach - should show $0 during trial, next_cycle shows base price
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: productWithTrial.id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(7), // Trial end
		total: 20, // Base price after trial (arrears usage billed separately)
	});

	// 2. Attach product with consumable
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: productWithTrial.id,
		redirect_mode: "if_required",
	});

	let customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is trialing
	await expectProductTrialing({
		customer,
		productId: productWithTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Verify consumable balance (included usage available) with resetsAt aligned to trial end
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
		resetsAt: advancedTo + ms.days(7),
	});

	// Verify $0 invoice during trial (Stripe creates invoice for trial subscriptions)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 0,
	});

	// 3. Track usage to overage (150 used = 50 over the 100 included)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 150,
	});
	await new Promise((r) => setTimeout(r, 2000));

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify usage during trial (150 used, 50 overage)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: -50, // 100 - 150 = -50 overage
		usage: 150,
	});

	// 4. Advance test clock past trial end
	const advancedToAfter = await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		currentEpochMs: advancedTo,
	});

	customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is NOT trialing
	await expectProductNotTrialing({
		customer,
		productId: productWithTrial.id,
		nowMs: advancedToAfter,
	});

	// Verify consumable does NOT reset - usage stays at 150, balance stays at -50
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: -50, // Still -50, no reset
		usage: 150, // Still 150, no reset
	});

	// Verify invoice only contains base price ($20), overage is NOT charged
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20, // Only base price, no overage
		latestInvoiceProductId: productWithTrial.id,
	});

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkNotTrialing: true },
	});
});
