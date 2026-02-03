/**
 * Free Trial Free Product Tests (Attach V2)
 *
 * Tests for free product trials (no Stripe subscription).
 *
 * Key behaviors:
 * - Free products with trial are isolated from Stripe subscription
 * - Trial gates features until trial ends
 * - Product's trial config always applies for free products
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, type ApiEntityV0, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductActive,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { timeout } from "@/utils/genUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Free product with trial (no Stripe subscription)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer attaches free product with trial (baseWithTrial)
 * - No base price, just features
 *
 * Expected Result:
 * - Product is trialing
 * - No Stripe subscription created
 * - Features available during trial
 */
test.concurrent(`${chalk.yellowBright("trial-free-product 1: free product with trial")}`, async () => {
	const customerId = "trial-free-prod-basic";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeWithTrial = products.baseWithTrial({
		id: "free-trial",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: false,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({}), // No payment method needed
			s.products({ list: [freeWithTrial] }),
		],
		actions: [],
	});

	// 1. Preview attach - should show $0 (free product), next_cycle shows $0 (free continues)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: freeWithTrial.id,
	});
	expect(preview.total).toBe(0);

	// 2. Attach free product with trial
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: freeWithTrial.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active
	await expectProductActive({
		customer,
		productId: freeWithTrial.id,
	});

	// Verify product is trialing
	await expectProductTrialing({
		customer,
		productId: freeWithTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Verify features available with resetsAt aligned to trial end
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
		resetsAt: advancedTo + ms.days(7),
	});

	// Verify no invoice (free product)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});

	// Verify no Stripe subscription
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Free trial product to paid product (creates Stripe subscription)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has free product with trial
 * - Upgrade to paid pro product
 *
 * Expected Result:
 * - Stripe subscription created
 * - Pro is active, free is removed
 */
test.concurrent(`${chalk.yellowBright("trial-free-product 3: free trial to paid product")}`, async () => {
	const customerId = "trial-free-prod-to-paid";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeWithTrial = products.baseWithTrial({
		id: "free-trial",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: false,
	});

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [freeWithTrial, pro] }),
		],
		actions: [s.billing.attach({ productId: freeWithTrial.id })],
	});

	// 1. Preview upgrade - should show $20 (pro price)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect(preview.total).toBe(20);

	// 2. Upgrade to pro
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer,
		active: [pro.id],
		notPresent: [freeWithTrial.id],
	});

	// Verify pro is NOT trialing
	await expectProductNotTrialing({
		customer,
		productId: pro.id,
		nowMs: advancedTo,
	});

	// Verify feature balance is pro's balance with resetsAt at billing cycle (no trial)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: addMonths(Date.now(), 1).getTime(),
	});

	// Verify invoice for pro
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Free trial product to paid trial product
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has free product with trial
 * - Upgrade to proWithTrial
 *
 * Expected Result:
 * - Pro starts fresh trial
 * - No immediate charge
 */
test.concurrent(`${chalk.yellowBright("trial-free-product 4: free trial to paid trial product")}`, async () => {
	const customerId = "trial-free-prod-to-paid-trial";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeWithTrial = products.baseWithTrial({
		id: "free-trial",
		items: [messagesItem],
		trialDays: 7,
		cardRequired: false,
	});

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [freeWithTrial, proTrial] }),
		],
		actions: [s.billing.attach({ productId: freeWithTrial.id })],
	});

	// 1. Preview upgrade - should show $0 (new trial), next_cycle shows pro price
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proTrial.id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14), // Fresh 14-day trial
		total: 20, // Pro price after trial
	});

	// 2. Upgrade to proTrial
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer,
		active: [proTrial.id],
		notPresent: [freeWithTrial.id],
	});

	// Verify pro is trialing with fresh 14-day trial
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Verify feature balance is pro's balance with resetsAt aligned to trial end
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: advancedTo + ms.days(14),
	});

	// Verify $0 invoice during trial (Stripe creates invoice for trial subscriptions)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 0,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Multiple free products with different trial configs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer attaches free product with 7-day trial
 * - Upgrade to different free product with 14-day trial
 *
 * Expected Result:
 * - New product gets fresh 14-day trial
 * - Old product removed
 */
test.concurrent(`${chalk.yellowBright("trial-free-product 6: free to different free with trial")}`, async () => {
	const customerId = "trial-free-prod-free-to-free";

	const messagesItem1 = items.monthlyMessages({ includedUsage: 100 });
	const free1 = products.baseWithTrial({
		id: "free1-trial",
		items: [messagesItem1],
		trialDays: 7,
		cardRequired: false,
	});

	const messagesItem2 = items.monthlyMessages({ includedUsage: 200 });
	const free2 = products.baseWithTrial({
		id: "free2-trial",
		items: [messagesItem2],
		trialDays: 14,
		cardRequired: false,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [free1, free2] })],
		actions: [s.billing.attach({ productId: free1.id })],
	});

	// Verify initial state - free1 is trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: free1.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// 1. Preview switch to free2 - should show $0, next_cycle shows $0 (free continues)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: free2.id,
	});
	expect(preview.total).toBe(0);

	// 2. Switch to free2
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free2.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer,
		active: [free2.id],
		notPresent: [free1.id],
	});

	// Verify free2 is trialing with fresh 14-day trial
	await expectProductTrialing({
		customer,
		productId: free2.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Verify feature balance is free2's balance with resetsAt aligned to trial end
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
		resetsAt: advancedTo + ms.days(14),
	});

	// Verify no invoice
	await expectCustomerInvoiceCorrect({
		customer,
		count: 0,
	});

	// Verify no Stripe subscription
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Entity pro products isolated from customer-level free trial
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity-1 and Entity-2 both have Pro products (on Stripe subscription, NOT trialing)
 * - Customer-level attaches a free product with trial
 * - Advance test clock past the free product's trial end
 *
 * Expected Result:
 * - Entity-1 and Entity-2's Pro products remain untouched (on subscription, not trialing)
 * - Free product's trial converts independently at customer level
 * - Free product has its own billing cycle separate from the subscription
 */
test.concurrent(`${chalk.yellowBright("trial-free-product 7: entity pro isolated from customer-level free trial")}`, async () => {
	const customerId = "trial-free-prod-entity-isolated";

	// Pro product for entities (paid, on subscription)
	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	// Free product for customer level (with 7-day trial)
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeWithTrial = products.baseWithTrial({
		id: "free-trial",
		items: [freeMessagesItem],
		trialDays: 7,
		cardRequired: false,
	});

	const { autumnV1, ctx, advancedTo, entities, testClockId } =
		await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, freeWithTrial] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				// Attach pro to both entities (on Stripe subscription, NOT trialing)
				s.billing.attach({ productId: pro.id, entityIndex: 0 }),
				s.billing.attach({ productId: pro.id, entityIndex: 1 }),
			],
		});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Verify initial state - both entities have Pro, NOT trialing
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductActive({ customer: entity1Before, productId: pro.id });
	await expectProductNotTrialing({
		customer: entity1Before,
		productId: pro.id,
		nowMs: advancedTo,
	});

	const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductActive({ customer: entity2Before, productId: pro.id });
	await expectProductNotTrialing({
		customer: entity2Before,
		productId: pro.id,
		nowMs: advancedTo,
	});

	// Attach free product with trial at CUSTOMER level (not entity level)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: freeWithTrial.id,
		redirect_mode: "if_required",
	});

	await timeout(2000);

	// Verify customer-level free product is trialing
	const customerDuringTrial =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerDuringTrial,
		productId: freeWithTrial.id,
	});
	await expectProductTrialing({
		customer: customerDuringTrial,
		productId: freeWithTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Verify entities' Pro products are still NOT trialing (unaffected by customer-level free trial)
	const entity1DuringTrial = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductNotTrialing({
		customer: entity1DuringTrial,
		productId: pro.id,
		nowMs: advancedTo,
	});

	const entity2DuringTrial = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductNotTrialing({
		customer: entity2DuringTrial,
		productId: pro.id,
		nowMs: advancedTo,
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

	await expectCustomerInvoiceCorrect({
		customer: customerDuringTrial,
		count: 2,
		latestTotal: 20,
	});

	// Advance test clock past the free product's trial end (7 days)
	const advancedToAfterTrial = await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify free product trial has ended and is now active (no longer trialing)
	const customerAfterTrial =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterTrial,
		productId: freeWithTrial.id,
	});
	await expectProductNotTrialing({
		customer: customerAfterTrial,
		productId: freeWithTrial.id,
		nowMs: advancedToAfterTrial,
	});

	// Verify entities' Pro products are STILL not trialing and remain on subscription billing cycle
	const entity1AfterTrial = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductActive({ customer: entity1AfterTrial, productId: pro.id });
	await expectProductNotTrialing({
		customer: entity1AfterTrial,
		productId: pro.id,
		nowMs: advancedToAfterTrial,
	});

	const entity2AfterTrial = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductActive({ customer: entity2AfterTrial, productId: pro.id });
	await expectProductNotTrialing({
		customer: entity2AfterTrial,
		productId: pro.id,
		nowMs: advancedToAfterTrial,
	});

	await expectCustomerInvoiceCorrect({
		customer: customerAfterTrial,
		count: 3, // Only the 2 Pro attaches
		latestTotal: 40, // Each Pro attach is $20
	});
});
