/**
 * Free Trial Merge Tests (Attach V2)
 *
 * Tests for add-on and entity scenarios where subscription trial state is inherited.
 *
 * Key behaviors:
 * - ADD-ONS: Inherit subscription's current trial state
 * - NEW ENTITIES: Inherit subscription's current trial state
 * - Product's trial config is IGNORED for merges
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, type ApiEntityV0, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	expectProductNotTrialing,
	expectProductTrialing,
} from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { timeout } from "@/utils/genUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Add-on to trialing subscription (inherits trial)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has proWithTrial (7-day trial, currently trialing)
 * - Attach add-on product ($20/mo)
 *
 * Expected Result:
 * - Add-on inherits subscription's trial state
 * - Add-on is trialing with same trial end as main product
 * - No charge for add-on during trial
 */
test.concurrent(`${chalk.yellowBright("trial-merge 1: add-on to trialing subscription (inherits trial)")}`, async () => {
	const customerId = "trial-merge-addon-trialing";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const addonItem = items.monthlyMessages({ includedUsage: 100 });
	const addon = products.recurringAddOn({
		id: "addon",
		items: [addonItem],
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, addon] }),
		],
		actions: [s.billing.attach({ productId: proTrial.id })],
	});

	// Verify initial state - pro is trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// 1. Preview add-on - should show $0 (inherits trial), next_cycle shows combined charge
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: addon.id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(7),
		total: 20, // Add-on ($20) after trial
	});

	// 2. Attach add-on
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: addon.id,
		redirect_mode: "if_required",
	});

	await timeout(4000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify both products are active
	await expectCustomerProducts({
		customer,
		active: [proTrial.id, addon.id],
	});

	// Verify pro is still trialing
	await expectProductTrialing({
		customer,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Verify add-on inherits trial state (same trial end)
	await expectProductTrialing({
		customer,
		productId: addon.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Verify $0 invoice during trial (Stripe creates invoice for trial subscriptions)
	// Count is 2: initial trial ($0) + add addon ($0)
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
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Add-on to non-trialing subscription (no trial)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo, NOT trialing)
 * - Attach add-on with trial config ($20/mo, 7-day trial - IGNORED)
 *
 * Expected Result:
 * - Add-on does NOT get trial (inherits non-trialing state)
 * - Charged immediately for add-on ($20)
 */
test.concurrent(`${chalk.yellowBright("trial-merge 2: add-on to non-trialing subscription (no trial)")}`, async () => {
	const customerId = "trial-merge-addon-not-trialing";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	// Add-on with trial config - should be IGNORED
	const addonItem = items.monthlyMessages({ includedUsage: 100 });
	const addonWithTrial = products.base({
		id: "addon-trial",
		items: [addonItem, items.monthlyPrice({ price: 20 })],
		isAddOn: true,
		trialDays: 7,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addonWithTrial] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Verify initial state - pro is NOT trialing
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotTrialing({
		customer: customerBefore,
		productId: pro.id,
		nowMs: advancedTo,
	});

	// 1. Preview add-on - should show $20 (no trial, product config ignored)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: addonWithTrial.id,
	});
	expect(preview.total).toBe(20);

	// 2. Attach add-on with trial config
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: addonWithTrial.id,
		redirect_mode: "if_required",
	});

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify both products are active
	await expectCustomerProducts({
		customer,
		active: [pro.id, addonWithTrial.id],
	});

	// Verify pro is NOT trialing
	await expectProductNotTrialing({
		customer,
		productId: pro.id,
		nowMs: advancedTo,
	});

	// Verify add-on is NOT trialing (inherits non-trialing state)
	await expectProductNotTrialing({
		customer,
		productId: addonWithTrial.id,
		nowMs: advancedTo,
	});

	// Verify invoices: pro ($20) + add-on ($20)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
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
// TEST 3: Entity attach to trialing subscription (inherits trial)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has proWithTrial on entity-1 (7-day trial, trialing)
 * - Attach same product to entity-2
 *
 * Expected Result:
 * - Entity-2 inherits subscription's trial state
 * - Both entities have same trial end
 */
test.concurrent(`${chalk.yellowBright("trial-merge 3: entity attach to trialing subscription (inherits trial)")}`, async () => {
	const customerId = "trial-merge-entity-trialing";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: proTrial.id, entityIndex: 0 })],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Verify initial state - entity-1 is trialing
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductTrialing({
		customer: entity1Before,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// 1. Preview attach to entity-2 - should show $0 (inherits trial), next_cycle shows charge for both entities
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proTrial.id,
		entity_id: entity2Id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(7), // Trial end
		total: 20, // 2 entities x $20 = $40 after trial
	});

	// 2. Attach to entity-2
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		entity_id: entity2Id,
		redirect_mode: "if_required",
	});

	await timeout(4000);

	// Verify entity-1 is still trialing
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductTrialing({
		customer: entity1,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Verify entity-2 inherits trial (same trial end)
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductTrialing({
		customer: entity2,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Verify $0 invoice during trial (Stripe creates invoice for trial subscriptions)
	// Count is 2: initial trial ($0) + add entity ($0)
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
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
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Entity attach to non-trialing subscription (no trial)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro on entity-1 (NOT trialing)
 * - Attach proWithTrial to entity-2 (trial config IGNORED)
 *
 * Expected Result:
 * - Entity-2 does NOT get trial (inherits non-trialing state)
 * - Charged immediately for entity-2
 */
test.concurrent(`${chalk.yellowBright("trial-merge 4: entity attach to non-trialing subscription (no trial)")}`, async () => {
	const customerId = "trial-merge-entity-not-trialing";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	// Product with trial config - should be IGNORED on entity add
	const proTrialMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proTrialMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const { autumnV1, ctx, entities, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, proTrial] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: pro.id, entityIndex: 0 })],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Verify initial state - entity-1 is NOT trialing
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductNotTrialing({
		customer: entity1Before,
		productId: pro.id,
		nowMs: advancedTo,
	});

	// 1. Preview attach trial product to entity-2 - should show $20 (no trial)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proTrial.id,
		entity_id: entity2Id,
	});
	expect(preview.total).toBe(20);

	// 2. Attach trial product to entity-2
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		entity_id: entity2Id,
		redirect_mode: "if_required",
	});

	// Verify entity-1 is NOT trialing
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductNotTrialing({
		customer: entity1,
		productId: pro.id,
		nowMs: advancedTo,
	});

	// Verify entity-2 is NOT trialing (trial config ignored)
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductNotTrialing({
		customer: entity2,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	// Verify invoices: entity-1 pro ($20) + entity-2 pro ($20)
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
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
