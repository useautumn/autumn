/**
 * Invoice Created Webhook Tests - Entity + Customer Consumables with Cancel
 *
 * Tests for handling the `invoice.created` Stripe webhook when both entity-level
 * and customer-level consumable products exist, particularly around cancellation.
 *
 * Key concern:
 * - Entity-level consumables use new invoice line items method (added during invoice.created)
 * - Customer-level consumables use Stripe metered prices (legacy, billed automatically)
 * - subscription.deleted creates arrear invoice for entity products
 * - invoice.created ALSO fires and may try to add line items
 * - Risk of DOUBLE BILLING for entity-level consumables
 *
 * Expected behaviors:
 * - Entity-level consumables should only be billed ONCE
 * - Customer-level consumables with meters should not get duplicate charges
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeInvoiceLineItemPeriodCorrect } from "@tests/integration/billing/utils/stripe/expectStripeInvoiceLineItemPeriodCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Entity consumable + Customer consumable - cancel customer end of cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has customer-level Pro with consumable messages (uses Stripe meters)
 * - Customer also has entity-level Pro with consumable messages (uses invoice line items)
 * - Track overage on BOTH customer and entity
 * - Cancel CUSTOMER-level product end of cycle (entity stays active)
 * - Advance to next invoice

 */
test(`${chalk.yellowBright("invoice.created entity+customer: cancel customer end of cycle - no double billing")}`, async () => {
	const customerId = "inv-created-ent-cus-eoc";

	// Customer-level consumable messages (will use Stripe meters)
	const customerConsumable = items.consumableMessages({ includedUsage: 100 });

	// Entity-level consumable messages (will use invoice line items)
	const entityConsumable = items.consumableMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});

	// Two separate products - both $20 base
	const customerPro = products.pro({
		id: "customer-pro",
		items: [customerConsumable],
	});

	const entityPro = products.pro({
		id: "entity-pro",
		items: [entityConsumable],
	});

	const { autumnV1, ctx, testClockId, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [customerPro, entityPro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: customerPro.id }), // Customer-level
			s.attach({ productId: entityPro.id, entityIndex: 0, timeout: 4000 }), // Entity-level
			s.track({ featureId: TestFeature.Messages, value: 300 }),
			s.track({ featureId: TestFeature.Messages, value: 250 }),
			s.updateSubscription({
				productId: customerPro.id,
				cancel: "end_of_cycle",
			}),
		],
	});

	const entityId = entities[0].id;

	// Verify initial invoices: $20 for customer-pro + $20 for entity-pro = $40
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 2,
	});

	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);

	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(-350);

	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-350);

	// Verify customer product is canceling
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: customerPro.id,
	});

	// Advance to next invoice
	const advancedTo = await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify final state
	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Customer product should be removed
	await expectProductNotPresent({
		customer: customerFinal,
		productId: customerPro.id,
	});

	// Entity product should still be active (not canceled)
	const entityFinal = await autumnV1.entities.get(customerId, entityId);
	await expectProductActive({
		customer: entityFinal,
		productId: entityPro.id,
	});

	expectCustomerFeatureCorrect({
		customer: customerFinal,
		featureId: TestFeature.Messages,
		balance: 100,
		resetsAt: addMonths(Date.now(), 2).getTime(),
	});

	const overageTotal = 35;
	expectCustomerInvoiceCorrect({
		customer: customerFinal,
		count: 3, // 2 initial attaches + 1 overage invoice
		latestTotal: overageTotal + 20, // 20 for one renewal.
	});

	// Verify line item billing periods are correct (now -> now + 1 month)
	await expectStripeInvoiceLineItemPeriodCorrect({
		customerId,
		productId: entityPro.id,
		periodStartMs: Date.now(),
		periodEndMs: advancedTo,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1b: Entity consumable + Customer consumable - cancel BOTH end of cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has customer-level Pro with consumable messages (uses Stripe meters)
 * - Customer also has entity-level Pro with consumable messages (uses invoice line items)
 * - Track overage on BOTH customer and entity
 * - Cancel BOTH products end of cycle
 * - Advance to next invoice
 *
 * Expected Result:
 * - Final invoice should only contain overages (no base prices)
 * - Customer overage: $20 (200 * $0.10)
 * - Entity overage: $15 (150 * $0.10)
 * - Total final invoice: $35
 */
test(`${chalk.yellowBright("invoice.created entity+customer: cancel both end of cycle - no double billing")}`, async () => {
	const customerId = "inv-created-both-cancel-eoc";

	// Customer-level consumable messages (will use Stripe meters)
	const customerConsumable = items.consumableMessages({ includedUsage: 100 });

	// Entity-level consumable messages (will use invoice line items)
	const entityConsumable = items.consumableMessages({
		includedUsage: 100,
		entityFeatureId: TestFeature.Users,
	});

	// Two separate products - both $20 base
	const customerPro = products.pro({
		id: "customer-pro",
		items: [customerConsumable],
	});

	const entityPro = products.pro({
		id: "entity-pro",
		items: [entityConsumable],
	});

	const { autumnV1, ctx, testClockId, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [customerPro, entityPro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: customerPro.id }), // Customer-level
			s.attach({ productId: entityPro.id, entityIndex: 0, timeout: 4000 }), // Entity-level
			s.track({ featureId: TestFeature.Messages, value: 300 }),
			s.track({ featureId: TestFeature.Messages, value: 250 }),
			s.updateSubscription({
				productId: customerPro.id,
				cancel: "end_of_cycle",
			}),
			s.updateSubscription({
				entityIndex: 0,
				productId: entityPro.id,
				cancel: "end_of_cycle",
			}),
		],
	});

	const entityId = entities[0].id;

	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);

	// Customer and entity balance: 200 - 550 = -350
	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(-350);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-350);

	// Verify both products are canceling
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: customerPro.id,
	});

	const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);
	await expectProductCanceling({
		customer: entityAfterCancel,
		productId: entityPro.id,
	});

	// Advance to next invoice
	const advancedTo = await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify final state - both products should be removed
	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerFinal,
		productId: customerPro.id,
	});

	const entityFinal = await autumnV1.entities.get(customerId, entityId);
	await expectProductNotPresent({
		customer: entityFinal,
		productId: entityPro.id,
	});

	expectCustomerInvoiceCorrect({
		customer: customerFinal,
		count: 3, // 2 initial attaches + 1 overage invoice
		latestTotal: 35,
	});

	// Verify line item billing periods are correct (now -> now + 1 month)
	await expectStripeInvoiceLineItemPeriodCorrect({
		customerId,
		productId: entityPro.id,
		periodStartMs: Date.now(),
		periodEndMs: advancedTo,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Regular cycle renewal (no cancel) - entity consumable
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has Pro with entity-level consumable messages
 * - Track overage on entity
 * - Advance to next cycle (no cancel, just regular renewal)
 *
 * This tests the normal happy path for invoice.created with entity consumables.
 *
 * Expected Result:
 * - Renewal invoice includes base price + overage
 * - Overage billed exactly once via invoice line items
 * - Balance resets after cycle
 */
test(`${chalk.yellowBright("invoice.created entity: regular renewal - overage billed once")}`, async () => {
	const customerId = "inv-created-ent-renewal";

	// Entity-level consumable messages

	const pro = products.pro({
		id: "pro",
		items: [items.consumableMessages({ includedUsage: 100 })],
	});

	const { autumnV1, ctx, testClockId, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.track({ featureId: TestFeature.Messages, value: 500 }),
		],
	});

	const entityId = entities[0].id;

	// Verify overage tracked
	const entityAfterTrack = await autumnV1.entities.get(customerId, entityId);
	expect(entityAfterTrack.features[TestFeature.Messages].balance).toBe(-400);

	// Advance to next cycle (regular renewal)
	const advancedTo = await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		withPause: true,
	});

	// Verify product still active
	const entityFinal = await autumnV1.entities.get(customerId, entityId);
	await expectProductActive({
		customer: entityFinal,
		productId: pro.id,
	});

	// Balance should reset to 100
	expectCustomerFeatureCorrect({
		customer: entityFinal,
		featureId: TestFeature.Messages,
		balance: 100,
		resetsAt: addMonths(Date.now(), 2).getTime(),
	});

	// Check invoices
	const customerFinal = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Expected invoices:
	// 1. Initial attach: $20
	// 2. Renewal: $20 base + $40 overage = $60
	expectCustomerInvoiceCorrect({
		customer: customerFinal,
		count: 2,
		latestTotal: 60,
	});

	// Verify line item billing periods are correct (now -> now + 1 month)
	await expectStripeInvoiceLineItemPeriodCorrect({
		customerId,
		productId: pro.id,
		periodStartMs: Date.now(),
		periodEndMs: advancedTo,
	});
});
