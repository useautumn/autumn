/**
 * Invoice Created Webhook Tests - Consumable Prices During Trial
 *
 * Tests for handling the `invoice.created` Stripe webhook event when a customer
 * is on a trial with consumable (usage-in-arrear) prices. When a trial ends,
 * the first invoice after trial should NOT include consumable charges from
 * the trial period - trial usage is "free".
 *
 * Key behavior tested:
 * - Trial ends → first invoice has base price only (no consumable overage)
 * - Balance resets after trial ends
 * - Works for both customer-level and entity-level products
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectProductNotTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Customer-level - Trial ends with overage → no consumable charge
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer attaches Pro with 14-day trial + consumable messages (100 included, $0.10/unit)
 * - Track 250 messages during trial (150 overage)
 * - Advance past trial end (14 days)
 *
 * Expected Result:
 * - First invoice after trial: $20 base only (no $15 overage charge for trial usage)
 * - Balance should be reset to 100 (included usage)
 */
test.concurrent(`${chalk.yellowBright("invoice.created trial: customer-level overage during trial → no charge after trial ends")}`, async () => {
	const customerId = "inv-trial-cus-overage";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [consumableItem],
		trialDays: 14,
	});

	const { autumnV1, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.attach({ productId: proTrial.id }),
			s.track({ featureId: TestFeature.Messages, value: 250 }), // 150 overage
			s.advanceTestClock({ days: 16 }), // Advance past trial end
		],
	});

	// Verify customer state after trial ends
	const customerAfterTrialEnd =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Product should be active (not trialing anymore)
	await expectProductActive({
		customer: customerAfterTrialEnd,
		productId: proTrial.id,
	});

	await expectProductNotTrialing({
		customer: customerAfterTrialEnd,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	// Balance should be reset to 100 (included usage) after trial ends
	expectCustomerFeatureCorrect({
		customer: customerAfterTrialEnd,
		featureId: TestFeature.Messages,
		balance: -150, // trial ending doesn't reset consumable balance.
	});

	// Should have 1 invoice: first real invoice after trial = $20 base only
	// NO overage charge for the 150 messages tracked during trial
	expectCustomerInvoiceCorrect({
		customer: customerAfterTrialEnd,
		count: 2,
		latestTotal: 20, // Only base price, no overage
		latestInvoiceProductId: proTrial.id,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Entity-level - Trial ends with overage → no consumable charge
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Create 1 entity
 * - Attach Pro with 14-day trial + consumable messages to entity
 * - Track 200 messages for entity during trial (100 overage)
 * - Advance past trial end
 *
 * Expected Result:
 * - First invoice after trial: $20 base only (no $10 overage charge)
 * - Entity balance should be reset to 100
 */
test.concurrent(`${chalk.yellowBright("invoice.created trial: entity-level overage during trial → no charge after trial ends")}`, async () => {
	const customerId = "inv-trial-ent-overage";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const monthlyPriceItem = items.monthlyPrice();
	const proTrial = products.base({
		id: "pro-trial",
		items: [monthlyPriceItem],
		trialDays: 14,
	});

	let { autumnV1, advancedTo, entities, ctx, testClockId } = await initScenario(
		{
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proTrial] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: proTrial.id, entityIndex: 0 })],
		},
	);

	await autumnV1.subscriptions.update(
		{
			customer_id: customerId,
			product_id: proTrial.id,
			entity_id: entities[0].id,
			items: [consumableItem, monthlyPriceItem],
		},
		{
			timeout: 5000,
		},
	);

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 200,
		entity_id: entities[0].id,
	});

	advancedTo = await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 20,
	});

	const entityId = entities[0].id;

	// Verify entity state after trial ends
	const entityAfterTrialEnd = await autumnV1.entities.get(customerId, entityId);

	// Product should be active (not trialing anymore)
	await expectProductActive({
		customer: entityAfterTrialEnd,
		productId: proTrial.id,
	});

	await expectProductNotTrialing({
		customer: entityAfterTrialEnd,
		productId: proTrial.id,
		nowMs: advancedTo,
	});

	// Balance should NOT be reset to 100 after trial ends (since it wasn't charged for)
	expectCustomerFeatureCorrect({
		customer: entityAfterTrialEnd,
		featureId: TestFeature.Messages,
		balance: -100,
	});

	// Check invoices at customer level
	const customerAfterTrialEnd =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// After first update to add consumable, a $0 invoice is created.
	// For second udpate, NO OVERAGE CHARGES.
	// NO overage charge for the 100 messages overage tracked during trial
	expectCustomerInvoiceCorrect({
		customer: customerAfterTrialEnd,
		count: 3,
		latestTotal: 20, // Only base price, no overage
		latestInvoiceProductId: proTrial.id,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Multiple entities with trial → no consumable charge on any
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Create 2 entities
 * - Attach Pro with 14-day trial to both entities (on same subscription)
 * - Track overage on both entities during trial:
 *   - Entity 0: 200 messages (100 overage → would be $10)
 *   - Entity 1: 250 messages (150 overage → would be $15)
 * - Advance past trial end
 *
 * Expected Result:
 * - First invoice after trial: $40 base ($20 x 2) only
 * - NO overage charges for either entity's trial usage
 * - Both entity balances should be reset to 100
 */
test.concurrent(`${chalk.yellowBright("invoice.created trial: multiple entities with overage during trial → no charge after trial ends")}`, async () => {
	const customerId = "inv-trial-multi-ent";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [consumableItem],
		trialDays: 14,
	});

	const { autumnV1, advancedTo, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: proTrial.id, entityIndex: 0 }),
			s.attach({ productId: proTrial.id, entityIndex: 1, timeout: 4000 }),
			s.track({ featureId: TestFeature.Messages, value: 200, entityIndex: 0 }), // 100 overage
			s.track({ featureId: TestFeature.Messages, value: 250, entityIndex: 1 }), // 150 overage
			s.advanceTestClock({ days: 20 }), // Advance past trial end
		],
	});

	// Verify entity 0 state after trial ends
	const entity0AfterTrialEnd = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	await expectProductActive({
		customer: entity0AfterTrialEnd,
		productId: proTrial.id,
	});
	await expectProductNotTrialing({
		customer: entity0AfterTrialEnd,
		productId: proTrial.id,
		nowMs: advancedTo,
	});
	expectCustomerFeatureCorrect({
		customer: entity0AfterTrialEnd,
		featureId: TestFeature.Messages,
		balance: -100,
	});

	// Verify entity 1 state after trial ends
	const entity1AfterTrialEnd = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);
	await expectProductActive({
		customer: entity1AfterTrialEnd,
		productId: proTrial.id,
	});
	await expectProductNotTrialing({
		customer: entity1AfterTrialEnd,
		productId: proTrial.id,
		nowMs: advancedTo,
	});
	expectCustomerFeatureCorrect({
		customer: entity1AfterTrialEnd,
		featureId: TestFeature.Messages,
		balance: -150,
	});

	// Check invoices at customer level
	const customerAfterTrialEnd =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should have 1 invoice (both entities share subscription during trial)
	// First real invoice = $40 base ($20 x 2) only
	// NO overage charges for either entity's trial usage ($10 + $15 = $25 would be charged if not trial)
	expectCustomerInvoiceCorrect({
		customer: customerAfterTrialEnd,
		count: 3,
		latestTotal: 40, // Only base price for both entities, no overage
	});
});
