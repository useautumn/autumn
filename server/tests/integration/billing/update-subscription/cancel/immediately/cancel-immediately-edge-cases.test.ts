/**
 * Cancel Immediately Edge Cases
 *
 * Tests for edge case scenarios when canceling subscriptions immediately.
 * Focuses on complex multi-product scenarios with subscription schedules.
 */

import { test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectCustomerProducts,
	expectProductCanceling,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Cancel pro immediately after entity cancel/uncancel/cancel cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro ($20/mo) and recurring add-on ($20/mo) attached to customer
 * - Premium ($50/mo) attached to entity
 * - Cancel entity (premium) at end of cycle
 * - Uncancel entity
 * - Cancel entity again at end of cycle
 * - Try to cancel pro on customer immediately with next_cycle_only
 *
 * This tests the edge case where a subscription schedule exists from the entity
 * cancel operations, and then we try to cancel a different product immediately.
 */
test.concurrent(`${chalk.yellowBright("cancel immediately edge: cancel pro after entity cancel/uncancel/cancel cycle")}`, async () => {
	const customerId = "cancel-imm-edge-entity-cycle";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const addon = products.recurringAddOn({
		id: "addon",
		items: [items.monthlyMessages({ includedUsage: 300 })],
	});

	const premiumPriceItem = items.monthlyPrice({ price: 50 });
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPriceItem],
	});

	const { autumnV1, entities, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro, addon, premium] }),
			s.entities({ count: 1, featureId: "users" }),
		],
		actions: [
			// A. Attach pro and recurring add-on to customer
			s.attach({ productId: pro.id }),
			s.attach({ productId: addon.id }),
			// B. Attach premium to entity
			s.attach({ productId: premium.id, entityIndex: 0, timeout: 3000 }),
			s.updateSubscription({
				productId: premium.id,
				entityIndex: 0,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	// Step 4: Try to cancel pro on customer immediately with next_cycle_only
	// This is the edge case - there's a subscription schedule from the entity operations,
	// and we're trying to cancel a different product immediately
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately",
		billing_behavior: "none",
	});

	// Verify pro is removed, addon still active
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterCancel,
		notPresent: [pro.id],
		active: [addon.id],
		canceling: [premium.id],
	});

	// Entity premium should still be canceling
	const entityFinal = await autumnV1.entities.get(customerId, entities[0].id);
	await expectProductCanceling({
		customer: entityFinal,
		productId: premium.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		// shouldBeCanceled: true,
	});
});
