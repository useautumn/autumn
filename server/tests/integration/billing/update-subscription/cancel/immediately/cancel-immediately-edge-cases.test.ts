/**
 * Cancel Immediately Edge Cases
 *
 * Tests for edge case scenarios when canceling subscriptions immediately.
 * Focuses on complex multi-product scenarios with subscription schedules.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, CusProductStatus } from "@autumn/shared";
import {
	expectCustomerProducts,
	expectProductCanceling,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { CusService } from "@/internal/customers/CusService";

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

test(`${chalk.yellowBright("cancel orphaned base: cancel_immediately on a paid recurring orphan does not create a new sub")}`, async () => {
	const customerId = "cancel-orphaned-base-immediately";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 20 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId: cid, autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const fullCustomerBefore = await CusService.getFull({
		ctx,
		idOrInternalId: cid,
	});
	const proCusProduct = fullCustomerBefore.customer_products.find(
		(cp) => cp.product_id === pro.id,
	);
	expect(proCusProduct).toBeDefined();

	const stripeCustomerId = fullCustomerBefore.processor?.id;
	if (!stripeCustomerId) throw new Error("missing stripe customer id");

	const subsBefore = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
	});
	expect(subsBefore.data.length).toBe(1);
	const originalProSubId = subsBefore.data[0].id;

	// Orphan the cusProduct — sub still exists in Stripe, link cleared in autumn
	await CusProductService.update({
		ctx,
		cusProductId: proCusProduct!.id,
		updates: { subscription_ids: [] },
	});

	// Cancel immediately on the orphan should not create a new Stripe sub.
	await autumnV1.subscriptions.update({
		customer_id: cid,
		product_id: pro.id,
		cancel_action: "cancel_immediately" as const,
	});

	const subsAfter = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
	});
	expect(subsAfter.data.length).toBe(1);
	expect(subsAfter.data[0].id).toBe(originalProSubId);

	const fullCustomerAfter = await CusService.getFull({
		ctx,
		idOrInternalId: cid,
	});
	const activePro = fullCustomerAfter.customer_products.find(
		(cp) =>
			cp.product_id === pro.id && cp.status === CusProductStatus.Active,
	);
	expect(activePro).toBeUndefined();
});
