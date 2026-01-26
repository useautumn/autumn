/**
 * Cancel Add-On Immediately Tests
 *
 * Tests for canceling add-on products immediately using `cancel: 'immediately'`.
 * Add-ons are products with `isAddOn: true` that attach alongside base products.
 *
 * Key behaviors:
 * - Add-on is removed immediately
 * - Base product (pro/premium) remains active
 * - Refund invoice created for unused time on paid add-ons
 * - Usage overage is NOT charged when canceling immediately
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectCustomerProducts,
	expectProductCanceling,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Basic immediate cancel - refund issued
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro ($20/mo) + recurring add-on ($20/mo)
 * - Cancel add-on immediately
 *
 * Expected Result:
 * - Add-on is removed
 * - Pro remains active
 * - Refund invoice (-$20) created for add-on
 * - No additional invoices after timeout
 */
test.concurrent(`${chalk.yellowBright("cancel addon immediately: basic refund")}`, async () => {
	const customerId = "cancel-addon-imm-1";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({ items: [messagesItem] });
	const recurringAddon = products.recurringAddOn({
		id: "recurring-addon",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, recurringAddon] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: recurringAddon.id }),
		],
	});

	// Verify both products are active
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerBefore,
		active: [pro.id, recurringAddon.id],
	});

	// Should have 2 invoices (pro attach + addon attach)
	expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 2,
	});

	// Cancel add-on immediately
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: recurringAddon.id,
		cancel_action: "cancel_immediately",
	});

	// Wait for async invoice processing
	await new Promise((resolve) => setTimeout(resolve, 3000));

	// Verify add-on removed, pro still active
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfter,
		active: [pro.id],
		notPresent: [recurringAddon.id],
	});

	// Verify refund invoice (-$20) and no extra invoices
	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 3, // pro attach + addon attach + addon refund
		latestTotal: -20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Cancel with usage overage - usage NOT charged
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro (free base) + usage add-on ($20/mo base + $0.10/msg overage)
 * - Track 1000 messages (all overage since includedUsage: 0)
 * - Cancel usage add-on immediately
 *
 * Expected Result:
 * - Add-on is removed
 * - Pro remains active
 * - Only refund invoice (-$20), usage is NOT charged
 */
test.concurrent(`${chalk.yellowBright("cancel addon immediately: usage overage not charged")}`, async () => {
	const customerId = "cancel-addon-imm-2";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.base({
		id: "pro",
		items: [messagesItem],
	});

	// Usage add-on: $20 base + consumable messages
	const usageAddon = products.base({
		id: "usage-addon",
		isAddOn: true,
		items: [
			items.monthlyPrice({ price: 20 }),
			items.consumableMessages({ includedUsage: 0 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, usageAddon] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: usageAddon.id }),
		],
	});

	// Track 1000 messages (all overage)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 1000,
	});

	// Wait for track to process
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Cancel usage add-on immediately
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: usageAddon.id,
		cancel_action: "cancel_immediately",
	});

	// Wait for async invoice processing
	await new Promise((resolve) => setTimeout(resolve, 3000));

	// Verify add-on removed, pro still active
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfter,
		active: [pro.id],
		notPresent: [usageAddon.id],
	});

	// Verify only refund invoice (-$20), NO usage charge
	// Invoices: addon attach ($20) + addon refund (-$20)
	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: -20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Cancel free add-on - premium unaffected
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach premium ($30/mo) + free add-on (no base price)
 * - Cancel free add-on immediately
 *
 * Expected Result:
 * - Free add-on is removed
 * - Premium remains active
 * - No new invoices (add-on was free)
 */
test.concurrent(`${chalk.yellowBright("cancel addon immediately: free addon cancel")}`, async () => {
	const customerId = "cancel-addon-imm-3";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const premium = products.base({
		id: "premium",
		items: [messagesItem, items.monthlyPrice({ price: 30 })],
	});

	const freeAddon = products.base({
		id: "free-addon",
		isAddOn: true,
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, freeAddon] }),
		],
		actions: [
			s.attach({ productId: premium.id }),
			s.attach({ productId: freeAddon.id }),
		],
	});

	// Verify both products active, 1 invoice (premium only)
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerBefore,
		active: [premium.id, freeAddon.id],
	});
	expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 1, // Only premium attach (free addon has no invoice)
		latestTotal: 30,
	});

	// Cancel free add-on immediately
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: freeAddon.id,
		cancel_action: "cancel_immediately",
	});

	// Wait for processing
	await new Promise((resolve) => setTimeout(resolve, 3000));

	// Verify free add-on removed, premium still active
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfter,
		active: [premium.id],
		notPresent: [freeAddon.id],
	});

	// No new invoices (free add-on has no refund)
	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 1,
		latestTotal: 30,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Cancel with scheduled downgrade - scheduled preserved then activates
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach premium ($30/mo) + recurring add-on ($20/mo)
 * - Downgrade premium -> pro ($20/mo) (schedules pro for end of cycle)
 * - Cancel add-on immediately
 * - Advance test clock to next cycle
 *
 * Expected Result:
 * - After cancel: premium active, pro scheduled, add-on gone
 * - After advance: pro active, premium gone, add-on gone
 */
test.concurrent(`${chalk.yellowBright("cancel addon immediately: with scheduled downgrade")}`, async () => {
	const customerId = "cancel-addon-imm-4";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	// Premium and pro in same group (default group)
	const premium = products.base({
		id: "premium",
		items: [messagesItem, items.monthlyPrice({ price: 30 })],
	});

	const pro = products.pro({ items: [messagesItem] }); // $20/mo

	const recurringAddon = products.recurringAddOn({
		id: "recurring-addon",
		items: [messagesItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro, recurringAddon] }),
		],
		actions: [
			s.attach({ productId: premium.id }),
			s.attach({ productId: recurringAddon.id }),
			s.attach({ productId: pro.id }), // Schedules downgrade
		],
	});

	// Verify: premium active, pro scheduled, addon active
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerBefore,
		active: [recurringAddon.id],
		canceling: [premium.id],
		scheduled: [pro.id],
	});

	// Cancel add-on immediately
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: recurringAddon.id,
		cancel_action: "cancel_immediately",
	});

	// Verify: premium active, pro still scheduled, addon gone
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterCancel,
		canceling: [premium.id],
		scheduled: [pro.id],
		notPresent: [recurringAddon.id],
	});

	// Advance test clock to next cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify: pro active, premium gone, addon gone
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterAdvance,
		active: [pro.id],
		notPresent: [premium.id, recurringAddon.id],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Cancel entity product - entity's base product unaffected
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Create entity
 * - Attach pro ($20/mo) to entity
 * - Attach recurring add-on ($20/mo) to entity
 * - Cancel add-on immediately (with entity_id)
 *
 * Expected Result:
 * - Entity's pro still active
 * - Add-on removed from entity
 */
test.concurrent(`${chalk.yellowBright("cancel addon immediately: entity product cancel")}`, async () => {
	const customerId = "cancel-addon-imm-5";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({ items: [messagesItem] });
	const recurringAddon = products.recurringAddOn({
		id: "recurring-addon",
		items: [messagesItem],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, recurringAddon] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: recurringAddon.id, entityIndex: 0 }),
		],
	});

	// Verify both products attached to entity
	const entityBefore = await autumnV1.entities.get(customerId, entities[0].id);
	await expectCustomerProducts({
		customer: entityBefore,
		active: [pro.id, recurringAddon.id],
	});

	// Cancel add-on immediately for entity
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: recurringAddon.id,
		cancel_action: "cancel_immediately",
	});

	// Wait for processing
	await new Promise((resolve) => setTimeout(resolve, 3000));

	// Verify entity's pro still active, addon removed
	const entityAfter = await autumnV1.entities.get(customerId, entities[0].id);
	await expectCustomerProducts({
		customer: entityAfter,
		active: [pro.id],
		notPresent: [recurringAddon.id],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Cancel both pro and add-on - only free default remains
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach pro ($20/mo) + recurring add-on ($20/mo)
 * - Free default product exists
 * - Cancel pro at end of cycle
 * - Cancel add-on immediately
 * - Advance test clock
 *
 * Expected Result:
 * - After cancels: pro canceling, addon removed
 * - After advance: only free default product remains
 */
test.concurrent(`${chalk.yellowBright("cancel addon immediately: cancel both pro and addon")}`, async () => {
	const customerId = "cancel-addon-imm-6";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const pro = products.pro({ items: [messagesItem] });
	const recurringAddon = products.recurringAddOn({
		id: "recurring-addon",
		items: [messagesItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, recurringAddon] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: recurringAddon.id }),
		],
	});

	// Verify both products active
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerBefore,
		active: [pro.id, recurringAddon.id],
	});

	// Cancel pro at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Cancel add-on immediately
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: recurringAddon.id,
		cancel_action: "cancel_immediately",
	});

	// Verify: pro canceling, addon removed
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectCustomerProducts({
		customer: customerAfterCancel,
		notPresent: [recurringAddon.id],
	});

	// Advance test clock
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Wait for webhooks
	await new Promise((resolve) => setTimeout(resolve, 3000));

	// Verify: only free default remains
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterAdvance,
		active: [free.id],
		notPresent: [pro.id, recurringAddon.id],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Multiple add-ons - cancel one, other remains
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach recurring add-on ($20/mo) + pro add-on ($20/mo)
 * - Cancel pro add-on immediately
 *
 * Expected Result:
 * - Recurring add-on still active
 * - Pro add-on removed
 * - Refund invoice (-$20) for pro add-on
 */
test.concurrent(`${chalk.yellowBright("cancel addon immediately: multiple addons cancel one")}`, async () => {
	const customerId = "cancel-addon-imm-7";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const recurringAddon = products.recurringAddOn({
		id: "recurring-addon",
		items: [messagesItem],
	});

	const proAddon = products.recurringAddOn({
		id: "pro-addon",
		items: [items.monthlyMessages({ includedUsage: 200 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [recurringAddon, proAddon] }),
		],
		actions: [
			s.attach({ productId: recurringAddon.id }),
			s.attach({ productId: proAddon.id }),
		],
	});

	// Verify both add-ons active
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerBefore,
		active: [recurringAddon.id, proAddon.id],
	});

	// Should have 2 invoices (both add-ons attach)
	expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 2,
	});

	// Cancel pro add-on immediately
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: proAddon.id,
		cancel_action: "cancel_immediately",
	});

	// Wait for processing
	await new Promise((resolve) => setTimeout(resolve, 3000));

	// Verify recurring addon still active, pro addon removed
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfter,
		active: [recurringAddon.id],
		notPresent: [proAddon.id],
	});

	// Verify refund invoice (-$20)
	expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 3, // recurring attach + pro attach + pro refund
		latestTotal: -20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: One-time add-on cancel - other add-on remains
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Attach one-time add-on (oneOffMessages) + pro add-on ($20/mo)
 * - Cancel one-time add-on immediately
 *
 * Expected Result:
 * - One-time add-on removed
 * - Pro add-on still active
 */
test.concurrent(`${chalk.yellowBright("cancel addon immediately: one-time addon cancel")}`, async () => {
	const customerId = "cancel-addon-imm-8";

	const oneTimeAddon = products.base({
		id: "one-time-addon",
		isAddOn: true,
		items: [items.oneOffMessages({ price: 20, billingUnits: 100 })],
	});

	const proAddon = products.recurringAddOn({
		id: "pro-addon",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneTimeAddon, proAddon] }),
		],
		actions: [
			s.attach({
				productId: oneTimeAddon.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
			s.attach({ productId: proAddon.id }),
		],
	});

	// Verify both add-ons active
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerBefore,
		active: [oneTimeAddon.id, proAddon.id],
	});

	// Cancel one-time add-on immediately
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: oneTimeAddon.id,
		cancel_action: "cancel_immediately",
	});

	// Wait for processing
	await new Promise((resolve) => setTimeout(resolve, 3000));

	// Verify one-time addon removed, pro addon still active
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfter,
		active: [proAddon.id],
		notPresent: [oneTimeAddon.id],
	});
});
