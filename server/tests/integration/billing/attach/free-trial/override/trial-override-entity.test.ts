/**
 * Free Trial Override Entity Tests (Attach V2)
 *
 * Tests for free_trial parameter override in multi-entity scenarios.
 *
 * Key behaviors:
 * - Entity attach with free_trial affects shared subscription (all entities)
 * - Entity attach with free_trial: null ends trial for all entities
 * - Upgrade with free_trial override affects all entities on subscription
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiEntityV0,
	FreeTrialDuration,
	ms,
} from "@autumn/shared";
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
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Entity attach with free_trial to active subscription
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity-1 has Pro (active, not trialing)
 * - Entity-2 attaches Pro with free_trial: { length: 14 }
 *
 * Expected Result:
 * - Both entities move to trial (shared subscription)
 */
test.concurrent(`${chalk.yellowBright("trial-override-entity 1: entity attach with free_trial to active sub")}`, async () => {
	const customerId = "trial-override-entity-active";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const { autumnV1, ctx, advancedTo, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: pro.id, entityIndex: 0 })],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Verify initial state - entity-1 has pro, not trialing
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductNotTrialing({
		customer: entity1Before,
		productId: pro.id,
		nowMs: advancedTo,
	});

	// 1. Preview entity-2 attach with free_trial override
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entity2Id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
		},
	});
	// Entity-1's pro refunded (-$20), entity-2's pro free during trial = -$20
	expect(preview.total).toBe(-20);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14),
		total: 20, // Pro ($20) for entity 2 after trial
	});

	// 2. Attach with free_trial override
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entity2Id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
		},
		redirect_mode: "if_required",
	});

	// Wait for webhook to sync trial status
	await timeout(4000);

	// Verify entity-2 is trialing
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductTrialing({
		customer: entity2,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Verify entity-1 is also trialing (shared subscription)
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductTrialing({
		customer: entity1,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Verify invoices: pro ($20) + refund (-$20)
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: 0,
	});

	expect(customer.invoices?.[1]?.total).toBe(-20);

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
// TEST 2: Entity attach with free_trial: null to trialing subscription
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity-1 has Pro (trialing)
 * - Entity-2 attaches Pro with free_trial: null
 *
 * Expected Result:
 * - Trial ends for both entities, both charged
 */
test.concurrent(`${chalk.yellowBright("trial-override-entity 2: entity attach with free_trial: null to trialing sub")}`, async () => {
	const customerId = "trial-override-entity-null";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 14,
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
		trialEndsAt: advancedTo + ms.days(14),
	});

	// 1. Preview entity-2 attach with free_trial: null
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proTrial.id,
		entity_id: entity2Id,
		free_trial: null,
	});
	// Entity-1's pro ($20) + entity-2's pro ($20) = $40
	expect(preview.total).toBe(40);

	// 2. Attach with free_trial: null
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		entity_id: entity2Id,
		free_trial: null,
		redirect_mode: "if_required",
	});

	// Wait for webhook to sync trial status
	await timeout(4000);

	// Verify entity-2 is NOT trialing
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductNotTrialing({
		customer: entity2,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	// Verify entity-1 is also NOT trialing (shared subscription)
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductNotTrialing({
		customer: entity1,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	// Verify invoices: $40 charge
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 40,
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
// TEST 3: Entity upgrade with free_trial override
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity-1 & 2 both on Pro (active, not trialing)
 * - Entity-1 upgrades to Premium with free_trial: { length: 14 }
 *
 * Expected Result:
 * - Both entities get 14-day trial (shared subscription)
 */
test.concurrent(`${chalk.yellowBright("trial-override-entity 3: entity upgrade with free_trial override")}`, async () => {
	const customerId = "trial-override-entity-upgrade";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1, ctx, advancedTo, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.billing.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Verify initial state - both entities on pro, not trialing
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductNotTrialing({
		customer: entity1Before,
		productId: pro.id,
		nowMs: advancedTo,
	});

	// 1. Preview entity-1 upgrade to premium with free_trial override
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entity1Id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
		},
	});
	// Refund: entity-1 pro ($20) + entity-2 pro ($20) = -$40
	expect(preview.total).toBe(-40);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14),
		total: 50, // Premium ($50) after trial
	});

	// 2. Upgrade with free_trial override
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entity1Id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
		},
		redirect_mode: "if_required",
	});

	// Wait for webhook to sync trial status
	await timeout(4000);

	// Verify entity-1 has premium and is trialing
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductTrialing({
		customer: entity1,
		productId: premium.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Verify entity-2 still has pro and is also trialing (shared subscription)
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductTrialing({
		customer: entity2,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Verify invoices: 2x pro ($40) + refund (-$40)
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 4,
		latestTotal: 0,
	});

	expect(customer.invoices?.[1]?.total).toBe(-40);

	// Verify Stripe subscription state
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		flags: { checkTrialing: true },
	});
});
