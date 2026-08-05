/**
 * Cancel End-of-Cycle Add-On Tests
 *
 * Slice 2 of 3: separate subscription add-on + entity-level.
 *
 * Tests for canceling add-on products at end of billing cycle.
 * Verifies add-on cancellation behavior, subscription handling,
 * and interaction with main products.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { isStripeSubscriptionCanceling } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Cancel add-on with separate subscription (new_billing_subscription)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Pro product ($20/mo)
 * - Recurring add-on product ($20/mo) attached with new_billing_subscription: true
 * - User cancels Add-on at end of cycle
 *
 * Expected Result:
 * - Two separate Stripe subscriptions exist initially
 * - After cancel EOC, only the add-on's subscription should be marked as canceling
 * - Pro's subscription should NOT be affected
 * - After advancing to next invoice:
 *   - Pro is still active with its subscription
 *   - Add-on is removed
 */
test.concurrent(
	`${chalk.yellowBright("cancel addon EOC: separate subscription (new_billing_subscription), correct sub canceled")}`,
	async () => {
		const customerId = "cancel-addon-eoc-separate-sub";

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

		// Get both subscription IDs (customerId is used as product prefix by default)
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

		// Verify both subscriptions are active (not canceling)
		const proSubBefore = await ctx.stripeCli.subscriptions.retrieve(proSubId);
		const addonSubBefore =
			await ctx.stripeCli.subscriptions.retrieve(addonSubId);

		expect(isStripeSubscriptionCanceling(proSubBefore)).toBe(false);
		expect(isStripeSubscriptionCanceling(addonSubBefore)).toBe(false);

		// Cancel add-on at end of cycle
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: addon.id,
			cancel_action: "cancel_end_of_cycle",
		});

		// Verify only the add-on subscription is canceling
		const proSubAfterCancel =
			await ctx.stripeCli.subscriptions.retrieve(proSubId);
		const addonSubAfterCancel =
			await ctx.stripeCli.subscriptions.retrieve(addonSubId);

		// Pro subscription should NOT be canceling
		expect(isStripeSubscriptionCanceling(proSubAfterCancel)).toBe(false);

		// Add-on subscription SHOULD be canceling
		expect(isStripeSubscriptionCanceling(addonSubAfterCancel)).toBe(true);

		// Verify customer product states
		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectProductActive({
			customer: customerAfterCancel,
			productId: pro.id,
		});

		await expectProductCanceling({
			customer: customerAfterCancel,
			productId: addon.id,
		});

		// Advance to next billing cycle
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		// Verify state after cycle
		const customerAfterAdvance =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Pro should still be active
		await expectProductActive({
			customer: customerAfterAdvance,
			productId: pro.id,
		});

		// Add-on should be removed
		await expectProductNotPresent({
			customer: customerAfterAdvance,
			productId: addon.id,
		});

		// Pro subscription should still exist and be active
		const proSubAfterAdvance =
			await ctx.stripeCli.subscriptions.retrieve(proSubId);
		expect(proSubAfterAdvance.status).toBe("active");
		expect(isStripeSubscriptionCanceling(proSubAfterAdvance)).toBe(false);

		// Should have 1 subscription remaining (pro)
		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
			subCount: 1,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Entity-level add-on cancel EOC
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity has Pro product ($20/mo)
 * - Entity has Add-on product ($20/mo)
 * - User cancels Add-on at end of cycle on entity
 *
 * Expected Result:
 * - Entity's Pro remains active
 * - Entity's Add-on is canceling
 * - After advancing to next invoice:
 *   - Entity's Pro is still active
 *   - Entity's Add-on is removed
 */
test.concurrent(
	`${chalk.yellowBright("cancel addon EOC: entity-level addon cancel")}`,
	async () => {
		const customerId = "cancel-addon-eoc-entity";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyMessages({ includedUsage: 300 })],
		});

		const { autumnV1, ctx, testClockId, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
				s.entities({ count: 1, featureId: "users" }),
			],
			actions: [
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: addon.id, entityIndex: 0 }),
			],
		});

		const entityId = entities[0].id;

		// Verify pro and add-on are active on entity
		const entityAfterAttach = await autumnV1.entities.get(customerId, entityId);

		await expectProductActive({
			customer: entityAfterAttach,
			productId: pro.id,
		});
		await expectProductActive({
			customer: entityAfterAttach,
			productId: addon.id,
		});

		// Cancel add-on at end of cycle on entity
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			entity_id: entityId,
			product_id: addon.id,
			cancel_action: "cancel_end_of_cycle",
		});

		// Verify state after cancel
		const entityAfterCancel = await autumnV1.entities.get(customerId, entityId);

		await expectProductActive({
			customer: entityAfterCancel,
			productId: pro.id,
		});
		await expectProductCanceling({
			customer: entityAfterCancel,
			productId: addon.id,
		});

		// Advance to next billing cycle
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		// Verify state after cycle
		const entityAfterAdvance = await autumnV1.entities.get(
			customerId,
			entityId,
		);

		await expectProductActive({
			customer: entityAfterAdvance,
			productId: pro.id,
		});
		await expectProductNotPresent({
			customer: entityAfterAdvance,
			productId: addon.id,
		});
	},
);
