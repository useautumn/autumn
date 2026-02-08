/**
 * Free Trial Override Null Tests (Attach V2)
 *
 * Tests for free_trial: null parameter behavior.
 *
 * Key behaviors:
 * - free_trial: null prevents trial even if product has trial config
 * - free_trial: null on free product works (no subscription, no trial)
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, type ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductNotTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
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
// TEST 1: Attach with free_trial: null (product has trial config)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Product has 14-day trial configuration
 * - Attach with free_trial: null
 *
 * Expected Result:
 * - No trial, charged immediately
 */
test.concurrent(`${chalk.yellowBright("trial-override-null 1: attach with free_trial: null (product has trial)")}`, async () => {
	const customerId = "trial-override-null-has-trial";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [],
	});

	// 1. Preview attach with free_trial: null
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proTrial.id,
		free_trial: null,
	});
	expect(preview.total).toBe(20); // Charged immediately

	// 2. Attach with free_trial: null
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		free_trial: null,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active and NOT trialing
	await expectProductActive({
		customer,
		productId: proTrial.id,
	});

	await expectProductNotTrialing({
		customer,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	// Verify features available with resetsAt at normal billing cycle (no trial)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
		resetsAt: addMonths(advancedTo, 1).getTime(),
	});

	// Verify invoice: $20 charge
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
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

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Free product with free_trial: null (no Stripe sub)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Free product (no price) has trial config
 * - Attach with free_trial: null
 *
 * Expected Result:
 * - No trial, product active immediately
 * - No Stripe subscription created
 */
test.concurrent(`${chalk.yellowBright("trial-override-null 2: free product with free_trial: null")}`, async () => {
	const customerId = "trial-override-null-free-product";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeWithTrial = products.baseWithTrial({
		id: "free-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({}), // No payment method needed for free product
			s.products({ list: [freeWithTrial] }),
		],
		actions: [],
	});

	// 1. Preview attach with free_trial: null
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: freeWithTrial.id,
		free_trial: null,
	});
	expect(preview.total).toBe(0); // Free product

	// 2. Attach with free_trial: null
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: freeWithTrial.id,
		free_trial: null,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active and NOT trialing
	await expectProductActive({
		customer,
		productId: freeWithTrial.id,
	});

	await expectProductNotTrialing({
		customer,
		productId: freeWithTrial.id,
	});

	// Verify features available
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
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
// TEST 3: Entity pro isolated from customer-level attach with free_trial: null
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity-1 and Entity-2 both have Pro products (on Stripe subscription, NOT trialing)
 * - Advance test clock (entities have been subscribed for a billing cycle)
 * - Customer-level attaches a free product with free_trial: null
 *
 * Expected Result:
 * - Entity-1 and Entity-2's Pro products remain untouched (on subscription, not trialing)
 * - Free product is active immediately with no trial (due to free_trial: null)
 * - No interference between customer-level free product and entity-level subscriptions
 */
test.concurrent(`${chalk.yellowBright("trial-override-null 3: entity pro isolated from customer-level attach with free_trial: null")}`, async () => {
	const customerId = "trial-override-null-entity-isolated";

	// Pro product for entities (paid, on subscription)
	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	// Free product for customer level (with trial config, but we'll use free_trial: null)
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

	// Verify initial invoices - 2 Pro attaches
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 2,
		latestTotal: 20,
	});

	// Advance test clock to next invoice (entities have been subscribed for a billing cycle)
	const advancedToAfterCycle = await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify entities are still active after billing cycle
	const entity1AfterCycle = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductActive({ customer: entity1AfterCycle, productId: pro.id });
	await expectProductNotTrialing({
		customer: entity1AfterCycle,
		productId: pro.id,
		nowMs: advancedToAfterCycle,
	});

	const entity2AfterCycle = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductActive({ customer: entity2AfterCycle, productId: pro.id });
	await expectProductNotTrialing({
		customer: entity2AfterCycle,
		productId: pro.id,
		nowMs: advancedToAfterCycle,
	});

	// Attach free product with free_trial: null at CUSTOMER level (not entity level)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: freeWithTrial.id,
		free_trial: null,
		redirect_mode: "if_required",
	});

	await timeout(2000);

	// Verify customer-level free product is active and NOT trialing (due to free_trial: null)
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: freeWithTrial.id,
	});
	await expectProductNotTrialing({
		customer: customerAfterAttach,
		productId: freeWithTrial.id,
		nowMs: advancedToAfterCycle,
	});

	// Verify entities' Pro products are still NOT trialing (unaffected by customer-level attach)
	const entity1AfterAttach = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductActive({
		customer: entity1AfterAttach,
		productId: pro.id,
	});
	await expectProductNotTrialing({
		customer: entity1AfterAttach,
		productId: pro.id,
		nowMs: advancedToAfterCycle,
	});

	const entity2AfterAttach = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductActive({
		customer: entity2AfterAttach,
		productId: pro.id,
	});
	await expectProductNotTrialing({
		customer: entity2AfterAttach,
		productId: pro.id,
		nowMs: advancedToAfterCycle,
	});

	// Verify Stripe subscription is correct (entity subs, not trialing)
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: {
			checkNotTrialing: true,
		},
	});

	// Verify invoices - should have renewal invoices for entity pro subscriptions
	await expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 3, // 2 initial Pro attaches + 1 renewal
		latestTotal: 40, // Renewal for both entities ($20 each)
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
