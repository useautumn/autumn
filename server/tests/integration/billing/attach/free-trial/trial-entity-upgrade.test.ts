/**
 * Free Trial Entity Upgrade Tests (Attach V2)
 *
 * Tests for entity upgrades that affect shared subscription trial state.
 *
 * Key behaviors:
 * - Entity upgrade to product with trial → fresh trial for ALL entities
 * - Entity upgrade to product without trial → trial ends for ALL entities
 * - All entities share the same subscription/trial state
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, type ApiEntityV0, ms } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
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
import { timeout } from "@/utils/genUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Entity upgrade to product with trial (fresh trial for ALL)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity-1 has proWithTrial (7-day trial, trialing)
 * - Entity-2 has same proWithTrial (sharing trial)
 * - Entity-1 upgrades to premiumWithTrial (14-day trial)
 *
 * Expected Result:
 * - Entity-1 gets fresh 14-day trial on premium
 * - Entity-2 continues with inherited trial state
 */
test.concurrent(`${chalk.yellowBright("trial-entity-upgrade 1: entity upgrade to product with trial")}`, async () => {
	const customerId = "trial-ent-upgrade-with-trial";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [premiumMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, premiumTrial] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: proTrial.id, entityIndex: 0 }),
			s.billing.attach({ productId: proTrial.id, entityIndex: 1 }),
		],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Verify initial state - both entities trialing
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductTrialing({
		customer: entity1Before,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// 1. Preview upgrade entity-1 to premium - should show $0 (fresh trial), next_cycle shows combined charge
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		entity_id: entity1Id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14), // Fresh 14-day trial
		total: 50, // Premium ($50)
	});

	// 2. Upgrade entity-1 to premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		entity_id: entity1Id,
		redirect_mode: "if_required",
	});
	await timeout(4000);

	// Verify entity-1 has premium with fresh 14-day trial
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductActive({
		customer: entity1,
		productId: premiumTrial.id,
	});
	await expectProductTrialing({
		customer: entity1,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Verify entity-2 still has pro (unchanged)
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductTrialing({
		customer: entity2,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(14), // Updated to match new subscription trial
	});

	// Verify $0 invoice during trial (Stripe creates invoice for trial subscriptions)
	// Count is 3: entity-1 trial ($0) + entity-2 trial ($0) + upgrade ($0)
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: 0,
		latestInvoiceProductId: premiumTrial.id,
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
// TEST 2: Entity upgrade to product without trial (trial ends for ALL)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity-1 has proWithTrial (7-day trial, trialing)
 * - Entity-2 has same proWithTrial (sharing trial)
 * - Entity-1 upgrades to premium (NO trial)
 *
 * Expected Result:
 * - Trial ends for ALL entities
 * - Entity-1 charged for premium
 * - Entity-2's pro is now charged (trial ended)
 */
test.concurrent(`${chalk.yellowBright("trial-entity-upgrade 2: entity upgrade to product without trial (trial ends)")}`, async () => {
	const customerId = "trial-ent-upgrade-no-trial";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
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
			s.products({ list: [proTrial, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: proTrial.id, entityIndex: 0 }),
			s.billing.attach({ productId: proTrial.id, entityIndex: 1 }),
		],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Verify initial state - both entities trialing
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductTrialing({
		customer: entity1Before,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// 1. Preview upgrade entity-1 to premium (no trial)
	// Should show premium ($50) + pro for entity-2 ($20) = $70
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entity1Id,
	});
	expect(preview.total).toBe(70); // Premium + Pro (trial ends for both)

	// 2. Upgrade entity-1 to premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		entity_id: entity1Id,
		redirect_mode: "if_required",
	});

	// Verify entity-1 has premium and NOT trialing
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductActive({
		customer: entity1,
		productId: premium.id,
	});
	await expectProductNotTrialing({
		customer: entity1,
		productId: premium.id,
		nowMs: advancedTo,
	});

	// Verify entity-2 pro is NOT trialing (trial ended for all)
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductNotTrialing({
		customer: entity2,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	// Verify invoice for both products
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
		latestTotal: 70,
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
// TEST 3: Entity downgrade during trial (scheduled, inherits trial)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity-1 and Entity-2 both have premiumWithTrial (14-day trial, trialing)
 * - Entity-1 downgrades to proWithTrial (scheduled)
 * - Entity-2 stays on premiumWithTrial
 *
 * Expected Result:
 * - Premium on Entity-1 stays trialing (canceling at trial end)
 * - Pro on Entity-1 is scheduled
 * - Premium on Entity-2 stays trialing
 * - After trial ends: Entity-1 has pro (not trialing), Entity-2 has premium (not trialing)
 */
test.concurrent(`${chalk.yellowBright("trial-entity-upgrade 3: entity downgrade during trial (scheduled)")}`, async () => {
	const customerId = "trial-ent-downgrade-scheduled";

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [premiumMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	let { autumnV1, ctx, advancedTo, entities, testClockId } = await initScenario(
		{
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [premiumTrial, proTrial] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: premiumTrial.id, entityIndex: 0 }),
				s.billing.attach({ productId: premiumTrial.id, entityIndex: 1 }),
			],
		},
	);

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// 1. Preview downgrade - should show $0 (scheduled), next_cycle shows pro + premium price
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proTrial.id,
		entity_id: entity1Id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(14), // Trial end (pro activates)
		total: 20, // Pro ($20)
	});

	// 2. Downgrade entity-1 to pro (scheduled)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proTrial.id,
		entity_id: entity1Id,
		redirect_mode: "if_required",
	});

	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);

	// Verify premium is canceling but still trialing on entity-1
	await expectProductCanceling({
		customer: entity1,
		productId: premiumTrial.id,
	});
	await expectProductTrialing({
		customer: entity1,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Verify pro is scheduled on entity-1
	await expectProductScheduled({
		customer: entity1,
		productId: proTrial.id,
	});

	// Verify entity-2 still has premium and is trialing
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductActive({
		customer: entity2,
		productId: premiumTrial.id,
	});
	await expectProductTrialing({
		customer: entity2,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Verify $0 invoice during trial (Stripe creates invoice for trial subscriptions)
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

	// ═══════════════════════════════════════════════════════════════════════════
	// ADVANCE PAST TRIAL: Verify scheduled downgrade activates correctly
	// ═══════════════════════════════════════════════════════════════════════════

	advancedTo = await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		currentEpochMs: advancedTo,
	});

	// Verify entity-1 now has pro (not scheduled, not trialing)
	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductActive({
		customer: entity1After,
		productId: proTrial.id,
	});
	await expectProductNotTrialing({
		customer: entity1After,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	// Verify entity-2 still has premium and is NOT trialing (trial ended)
	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductActive({
		customer: entity2After,
		productId: premiumTrial.id,
	});
	await expectProductNotTrialing({
		customer: entity2After,
		productId: premiumTrial.id,
		nowMs: advancedTo,
	});

	// Verify invoice: $0 trial invoice + $70 renewal (pro $20 + premium $50)
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 3,
		latestTotal: 70,
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
// TEST 4: One entity upgrades, another stays on trial product
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity-1 and Entity-2 both have proWithTrial (7-day trial, trialing)
 * - Advance 3 days into trial
 * - Entity-1 upgrades to premiumWithTrial (14-day trial)
 * - Entity-2 stays on proWithTrial
 *
 * Expected Result:
 * - Both entities share the new trial end (now + 14 days from upgrade time)
 * - Entity-1 has premium, Entity-2 has pro
 */
test.concurrent(`${chalk.yellowBright("trial-entity-upgrade 4: mixed products after entity upgrade")}`, async () => {
	const customerId = "trial-ent-upgrade-mixed";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [premiumMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo, entities, testClockId } =
		await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial, premiumTrial] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: proTrial.id, entityIndex: 0 }),
				s.billing.attach({ productId: proTrial.id, entityIndex: 1 }),
			],
		});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Verify initial state - both entities trialing with 7-day trial
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductTrialing({
		customer: entity1Before,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Advance 3 days into trial
	const advancedTo3Days = await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		currentEpochMs: advancedTo,
	});

	// New trial end is 14 days from upgrade time (now + 14 days)
	const newTrialEnd = advancedTo3Days + ms.days(14);

	// 1. Preview upgrade - should show $0 (fresh trial), next_cycle shows combined charge
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		entity_id: entity1Id,
	});
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: newTrialEnd, // Fresh 14-day trial from now
		total: 70, // Premium ($50) + Pro ($20) after trial
	});

	// 2. Upgrade entity-1 to premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		entity_id: entity1Id,
		redirect_mode: "if_required",
	});

	// Wait for webhook to sync trial status
	await timeout(4000);

	// Verify entity-1 has premium with fresh 14-day trial
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductActive({
		customer: entity1,
		productId: premiumTrial.id,
	});
	await expectProductTrialing({
		customer: entity1,
		productId: premiumTrial.id,
		trialEndsAt: newTrialEnd,
	});

	// Verify entity-2 still has pro but now shares premium's 14-day trial end
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductActive({
		customer: entity2,
		productId: proTrial.id,
	});
	await expectProductTrialing({
		customer: entity2,
		productId: proTrial.id,
		trialEndsAt: newTrialEnd, // Shares new 14-day trial end
	});

	// Verify $0 invoice during trial (Stripe creates invoice for trial subscriptions)
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3,
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
// TEST 5: Both entities upgrade from proTrial to premiumTrial sequentially
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity-1 has proWithTrial (7-day trial, trialing)
 * - Entity-2 has proWithTrial (7-day trial, trialing, shared subscription)
 * - Entity-1 upgrades to premiumWithTrial (14-day trial) → fresh trial for ALL
 * - Entity-2 upgrades to premiumWithTrial → both on premium, still trialing
 *
 * Expected Result:
 * - After entity-1 upgrade: entity-1 has premium (14-day trial), entity-2 has pro (inherited 14-day trial)
 * - After entity-2 upgrade: both entities have premium, both trialing with same trial end
 * - All invoices $0 during trial
 */
test.concurrent(`${chalk.yellowBright("trial-entity-upgrade 5: both entities upgrade proTrial → premiumTrial")}`, async () => {
	const customerId = "trial-ent-both-upgrade";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [proMessagesItem],
		trialDays: 7,
		cardRequired: true,
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [premiumMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial, premiumTrial] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: proTrial.id, entityIndex: 0 }),
			s.billing.attach({ productId: proTrial.id, entityIndex: 1 }),
		],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Verify initial state - both entities trialing with 7-day trial
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductTrialing({
		customer: entity1Before,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductTrialing({
		customer: entity2Before,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// STEP 1: Upgrade entity-1 to premiumTrial
	// ═══════════════════════════════════════════════════════════════════════════

	const preview1 = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		entity_id: entity1Id,
	});
	expect(preview1.total).toBe(0); // Trial → trial = $0
	expectPreviewNextCycleCorrect({
		preview: preview1,
		startsAt: advancedTo + ms.days(14), // Fresh 14-day trial
		total: 50, // Premium ($50) only entity-1 upgraded so far
	});

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		entity_id: entity1Id,
		redirect_mode: "if_required",
	});
	await timeout(4000);

	// Entity-1: premium with fresh 14-day trial
	const entity1Mid = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductActive({
		customer: entity1Mid,
		productId: premiumTrial.id,
	});
	await expectProductTrialing({
		customer: entity1Mid,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Entity-2: still on pro, but inherited 14-day trial end
	const entity2Mid = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductTrialing({
		customer: entity2Mid,
		productId: proTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// ═══════════════════════════════════════════════════════════════════════════
	// STEP 2: Upgrade entity-2 to premiumTrial
	// ═══════════════════════════════════════════════════════════════════════════

	const preview2 = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		entity_id: entity2Id,
	});
	expect(preview2.total).toBe(0); // Trial → trial = $0

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		entity_id: entity2Id,
		redirect_mode: "if_required",
	});
	await timeout(4000);

	// Entity-1: still premium, still trialing
	const entity1After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductActive({
		customer: entity1After,
		productId: premiumTrial.id,
	});
	await expectProductTrialing({
		customer: entity1After,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Entity-2: now premium, trialing with same trial end
	const entity2After = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductActive({
		customer: entity2After,
		productId: premiumTrial.id,
	});
	await expectProductTrialing({
		customer: entity2After,
		productId: premiumTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// All invoices should be $0 during trial
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
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
// TEST 6: Non-trialing entity upgrade to trial product
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity-1 has pro ($20/mo, NOT trialing)
 * - Entity-2 has same pro (NOT trialing)
 * - Entity-1 upgrades to premiumWithTrial
 *
 * Expected Result:
 * - Fresh trial starts for entity-1's premium
 * - Entity-2's pro gets refunded (subscription moved to trial)
 */
test.concurrent(`${chalk.yellowBright("trial-entity-upgrade 6: non-trialing upgrade to trial product")}`, async () => {
	const customerId = "trial-ent-notrial-to-trial";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premiumTrial = products.premiumWithTrial({
		id: "premium-trial",
		items: [premiumMessagesItem],
		trialDays: 14,
		cardRequired: true,
	});

	const { autumnV1, ctx, advancedTo, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premiumTrial] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.billing.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Verify initial state - neither entity is trialing
	const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductNotTrialing({
		customer: entity1Before,
		productId: pro.id,
		nowMs: advancedTo,
	});

	// 1. Preview upgrade to premium with trial
	// Should show negative (refund for both pro products)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		entity_id: entity1Id,
	});
	// Refund for entity-1 pro (-$20) + refund for entity-2 pro (-$20) = -$40
	expect(preview.total).toBe(-40);

	// 2. Upgrade entity-1 to premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premiumTrial.id,
		entity_id: entity1Id,
		redirect_mode: "if_required",
	});

	// Verify invoices: initial charges + refunds
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 3, // entity-1 pro ($20) + entity-2 pro ($20) + refund (-$40)
		latestTotal: -40,
	});

	await timeout(4000);

	// Verify entity-1 has premium with fresh 14-day trial
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);
	await expectProductTrialing({
		customer: entity1,
		productId: premiumTrial.id,
	});

	// Verify entity-2's pro is now trialing (subscription moved to trial)
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductTrialing({
		customer: entity2,
		productId: pro.id,
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
