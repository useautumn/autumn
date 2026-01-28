/**
 * Cancel End-of-Cycle Edge Cases
 *
 * Tests for edge case scenarios when canceling subscriptions at end of cycle.
 * Focuses on multi-subscription scenarios (new_billing_subscription) and
 * verifying correct Stripe subscription handling.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectCustomerProducts,
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { isStripeSubscriptionCanceling } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Cancel both pro and addon EOC (separate subscriptions) - verify correct subs canceled
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro product ($20/mo)
 * - Recurring add-on product ($20/mo) attached with new_billing_subscription: true
 * - User cancels Pro at end of cycle
 * - User cancels Add-on at end of cycle
 *
 * Expected Result:
 * - Two separate Stripe subscriptions exist initially
 * - After canceling Pro EOC, only Pro's subscription should be marked as canceling
 * - After canceling Add-on EOC, Add-on's subscription should also be marked as canceling
 * - After advancing to next invoice:
 *   - Both products are removed
 *   - No Stripe subscriptions remain
 */
test.concurrent(`${chalk.yellowBright("cancel EOC edge: cancel both pro and addon (separate subs) - correct subs canceled")}`, async () => {
	const customerId = "cancel-eoc-both-separate-subs";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const addon = products.recurringAddOn({
		id: "addon",
		items: [items.monthlyMessages({ includedUsage: 300 })],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.attach({ productId: addon.id, newBillingSubscription: true }),
		],
	});

	// Get both subscription IDs
	const proSubId = await getSubscriptionId({
		ctx,
		customerId,
		productId: pro.id,
	});

	const addonSubId = await getSubscriptionId({
		ctx,
		customerId,
		productId: addon.id,
	});

	// Verify they are different subscriptions
	expect(proSubId).not.toBe(addonSubId);

	// Verify both subscriptions are active initially
	const proSubBefore = await ctx.stripeCli.subscriptions.retrieve(proSubId);
	const addonSubBefore = await ctx.stripeCli.subscriptions.retrieve(addonSubId);

	expect(isStripeSubscriptionCanceling(proSubBefore)).toBe(false);
	expect(isStripeSubscriptionCanceling(addonSubBefore)).toBe(false);

	// Cancel pro at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify only Pro subscription is canceling, Add-on is NOT
	const proSubAfterProCancel =
		await ctx.stripeCli.subscriptions.retrieve(proSubId);
	const addonSubAfterProCancel =
		await ctx.stripeCli.subscriptions.retrieve(addonSubId);

	expect(isStripeSubscriptionCanceling(proSubAfterProCancel)).toBe(true);
	expect(isStripeSubscriptionCanceling(addonSubAfterProCancel)).toBe(false);

	// Verify customer product states after pro cancel
	const customerAfterProCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerAfterProCancel,
		productId: pro.id,
	});
	await expectProductActive({
		customer: customerAfterProCancel,
		productId: addon.id,
	});

	// Now cancel add-on at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: addon.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify BOTH subscriptions are now canceling
	const proSubAfterBothCancel =
		await ctx.stripeCli.subscriptions.retrieve(proSubId);
	const addonSubAfterBothCancel =
		await ctx.stripeCli.subscriptions.retrieve(addonSubId);

	expect(isStripeSubscriptionCanceling(proSubAfterBothCancel)).toBe(true);
	expect(isStripeSubscriptionCanceling(addonSubAfterBothCancel)).toBe(true);

	// Verify customer product states after both cancels
	const customerAfterBothCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerProducts({
		customer: customerAfterBothCancel,
		canceling: [pro.id, addon.id],
	});

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify state after cycle - both products should be removed
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: pro.id,
	});
	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: addon.id,
	});

	// No products should remain
	expect(customerAfterAdvance.products.length).toBe(0);

	// Verify no Stripe subscriptions exist
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Entity cancel EOC -> uncancel -> cancel EOC again
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro product ($20/mo) attached to entity 1 and entity 2
 * - Cancel entity 1 at end of cycle
 * - Uncancel entity 1
 * - Cancel entity 1 at end of cycle AGAIN
 *
 * Expected Result:
 * - After first cancel: entity 1 is canceling, entity 2 is active
 * - After uncancel: entity 1 is active again, entity 2 is active
 * - After second cancel: entity 1 is canceling again, entity 2 is still active
 */
test.concurrent(`${chalk.yellowBright("cancel EOC edge: entity cancel -> uncancel -> cancel again")}`, async () => {
	const customerId = "cancel-eoc-uncancel-cancel-again";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: "users" }),
		],
		actions: [
			s.attach({ productId: pro.id, entityIndex: 0 }),
			s.attach({ productId: pro.id, entityIndex: 1 }),
		],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Verify both entities have pro active
	const entity1Initial = await autumnV1.entities.get(customerId, entity1Id);
	const entity2Initial = await autumnV1.entities.get(customerId, entity2Id);

	await expectProductActive({ customer: entity1Initial, productId: pro.id });
	await expectProductActive({ customer: entity2Initial, productId: pro.id });

	// Step 1: Cancel entity 1 at end of cycle
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify entity 1 is canceling, entity 2 is still active
	const entity1AfterCancel = await autumnV1.entities.get(customerId, entity1Id);
	const entity2AfterCancel = await autumnV1.entities.get(customerId, entity2Id);

	await expectProductCanceling({
		customer: entity1AfterCancel,
		productId: pro.id,
	});
	await expectProductActive({
		customer: entity2AfterCancel,
		productId: pro.id,
	});

	// Step 2: Uncancel entity 1
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: pro.id,
		cancel_action: "uncancel",
	});

	// Verify entity 1 is active again, entity 2 is still active
	const entity1AfterUncancel = await autumnV1.entities.get(
		customerId,
		entity1Id,
	);
	const entity2AfterUncancel = await autumnV1.entities.get(
		customerId,
		entity2Id,
	);

	await expectProductActive({
		customer: entity1AfterUncancel,
		productId: pro.id,
	});
	await expectProductActive({
		customer: entity2AfterUncancel,
		productId: pro.id,
	});

	// Step 3: Cancel entity 1 at end of cycle AGAIN
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entity1Id,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	// Verify entity 1 is canceling again, entity 2 is still active
	const entity1AfterSecondCancel = await autumnV1.entities.get(
		customerId,
		entity1Id,
	);
	const entity2AfterSecondCancel = await autumnV1.entities.get(
		customerId,
		entity2Id,
	);

	await expectProductCanceling({
		customer: entity1AfterSecondCancel,
		productId: pro.id,
	});
	await expectProductActive({
		customer: entity2AfterSecondCancel,
		productId: pro.id,
	});
});
