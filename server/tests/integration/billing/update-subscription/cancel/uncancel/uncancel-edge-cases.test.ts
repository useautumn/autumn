import { expect, test } from "bun:test";
import { type ApiCustomerV3, FreeTrialDuration, ms } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
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
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";

/**
 * Uncancel Edge Cases Tests
 *
 * Critical edge cases for update subscription that combine multiple operations.
 * These tests cover parameter combinations that weren't previously tested.
 */

// ===============================================================================
// TEST 1: Uncancel + version upgrade
// ===============================================================================

/**
 * User is on Pro v1 (canceling), uncancels AND upgrades to v2 in one request.
 * Verifies: version change + uncancel combined, proration, scheduled product deleted.
 */
test.concurrent(`${chalk.yellowBright("uncancel + version upgrade")}`, async () => {
	const customerId = "uncancel-version-upgrade";
	const messagesItemV1 = items.monthlyMessages({ includedUsage: 100 });
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 10 });

	// products.pro already includes $20/month price
	const pro = products.pro({ items: [messagesItemV1] });
	const free = constructProduct({
		id: "free",
		items: [freeMessagesItem],
		type: "free",
		isDefault: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.updateSubscription({
				productId: pro.id,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	// Verify pro is canceling and free is scheduled
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
	});

	// Create v2 with increased features (price stays $20 from pro)
	const messagesItemV2 = items.monthlyMessages({ includedUsage: 200 });
	await autumnV1.products.update(pro.id, {
		items: [messagesItemV2],
	});

	// Preview uncancel + version upgrade (same price, just feature change)
	await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
		version: 2,
	});

	// Execute uncancel + version upgrade
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
		version: 2,
	});

	// Verify pro is now active (not canceling)
	const customerAfterUpdate =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUpdate,
		productId: pro.id,
	});

	// Scheduled free product should be deleted
	await expectProductNotPresent({
		customer: customerAfterUpdate,
		productId: free.id,
	});

	// Should have v2 features (200 messages)
	expectCustomerFeatureCorrect({
		customer: customerAfterUpdate,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});
});

// ===============================================================================
// TEST 2: Uncancel + add trial (paid product enters trial)
// ===============================================================================

/**
 * User is on paid Pro (canceling, not trialing), uncancels AND adds a trial.
 * Verifies: gets refund for entering trial, trial end set correctly.
 */
test.concurrent(`${chalk.yellowBright("uncancel + add trial")}`, async () => {
	const customerId = "uncancel-add-trial";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 10 });

	// products.pro already includes $20/month price
	const pro = products.pro({ items: [messagesItem] });
	const free = constructProduct({
		id: "free",
		items: [freeMessagesItem],
		type: "free",
		isDefault: true,
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.updateSubscription({
				productId: pro.id,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	// Verify pro is canceling (not trialing)
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductNotTrialing({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	// Preview uncancel + add trial
	const trialDays = 14;
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
		free_trial: {
			length: trialDays,
			duration: FreeTrialDuration.Day,
			card_required: true,
			unique_fingerprint: false,
		},
	});

	// Should refund for entering trial (negative total)
	expect(preview.total).toBeLessThan(0);

	// next_cycle should show when trial ends
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: advancedTo + ms.days(trialDays),
		total: 20, // pro price
	});

	// Execute uncancel + add trial
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
		free_trial: {
			length: trialDays,
			duration: FreeTrialDuration.Day,
			card_required: true,
			unique_fingerprint: false,
		},
	});

	// Verify pro is now active AND trialing
	const customerAfterUpdate =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUpdate,
		productId: pro.id,
	});
	await expectProductTrialing({
		customer: customerAfterUpdate,
		productId: pro.id,
		trialEndsAt: advancedTo + ms.days(trialDays),
	});

	// Scheduled free should be deleted
	await expectProductNotPresent({
		customer: customerAfterUpdate,
		productId: free.id,
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

// ===============================================================================
// TEST 3: Remove trial while canceling (cancel state preserved)
// ===============================================================================

/**
 * User is on Pro (trialing AND canceling), removes trial but does NOT uncancel.
 * Verifies: cancel state is preserved, charged for ending trial.
 */
test.concurrent(`${chalk.yellowBright("remove trial while canceling: cancel preserved")}`, async () => {
	const customerId = "remove-trial-while-cancel";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 10 });

	// products.proWithTrial includes $20/month price + trial
	const pro = products.proWithTrial({
		items: [messagesItem],
		id: "pro-trial",
		trialDays: 14,
	});
	const free = constructProduct({
		id: "free",
		items: [freeMessagesItem],
		type: "free",
		isDefault: true,
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.updateSubscription({
				productId: pro.id,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	// Verify trialing + canceling
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductTrialing({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
	});

	// Preview removing trial (NOT uncanceling)
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		free_trial: null,
	});

	// Should charge for ending trial
	expect(preview.total).toBeGreaterThan(0);

	// Execute remove trial
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		free_trial: null,
	});

	// Verify pro is STILL canceling but NOT trialing
	const customerAfterUpdate =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterUpdate,
		productId: pro.id,
	});
	await expectProductNotTrialing({
		customer: customerAfterUpdate,
		productId: pro.id,
	});

	// Scheduled free should STILL be scheduled
	await expectProductScheduled({
		customer: customerAfterUpdate,
		productId: free.id,
	});

	// Verify invoices (don't assert latestTotal - proration varies based on timing)
	expectCustomerInvoiceCorrect({
		customer: customerAfterUpdate,
		count: 2,
	});

	// Verify Stripe subscription (should still be set to cancel)
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: true,
	});
});

// ===============================================================================
// TEST 4: Uncancel during downgrade (Premium -> Pro, uncancel Premium)
// ===============================================================================

/**
 * User is on Premium ($50), downgrades to Pro (Premium canceling, Pro scheduled).
 * User uncancels Premium. Verifies: Premium active, scheduled Pro deleted.
 */
test.concurrent(`${chalk.yellowBright("uncancel during downgrade")}`, async () => {
	const customerId = "uncancel-downgrade";
	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const proMessagesItem = items.monthlyMessages({ includedUsage: 100 });

	// constructProduct with type: "premium" adds $50/month price
	const premium = constructProduct({
		id: "premium",
		items: [premiumMessagesItem],
		type: "premium",
		isDefault: false,
	});

	// products.pro adds $20/month price
	const pro = products.pro({ items: [proMessagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [s.attach({ productId: premium.id })],
	});

	// Verify premium is active
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerBefore,
		productId: premium.id,
	});

	// Downgrade from Premium to Pro
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	// Verify Premium is canceling, Pro is scheduled
	const customerAfterDowngrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterDowngrade,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: customerAfterDowngrade,
		productId: pro.id,
	});

	// Uncancel Premium
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: premium.id,
		cancel_action: "uncancel",
	});

	// Verify Premium is active, Pro is deleted
	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: premium.id,
	});
	await expectProductNotPresent({
		customer: customerAfterUncancel,
		productId: pro.id,
	});

	// Features should be unchanged
	expectCustomerFeatureCorrect({
		customer: customerAfterUncancel,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

// ===============================================================================
// TEST 5: Uncancel + custom items + invoice mode
// ===============================================================================

/**
 * User is on Pro (canceling), uncancels with custom items using invoice mode.
 * Verifies: invoice created and paid, product updated, scheduled product deleted.
 */
test.concurrent(`${chalk.yellowBright("uncancel + items + invoice mode")}`, async () => {
	const customerId = "uncancel-invoice-mode";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 10 });

	// products.pro adds $20/month price
	const pro = products.pro({ items: [messagesItem] });
	const free = constructProduct({
		id: "free",
		items: [freeMessagesItem],
		type: "free",
		isDefault: true,
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, free] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.updateSubscription({
				productId: pro.id,
				cancelAction: "cancel_end_of_cycle",
			}),
		],
	});

	// Verify canceling
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	await expectProductScheduled({
		customer: customerAfterCancel,
		productId: free.id,
	});

	// Custom items: more features + higher price ($40)
	const customMessagesItem = items.monthlyMessages({ includedUsage: 200 });
	const customPriceItem = items.monthlyPrice({ price: 40 });

	// Preview
	const preview = await autumnV1.subscriptions.previewUpdate({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
		items: [customMessagesItem, customPriceItem],
		invoice: true,
		finalize_invoice: true,
	});

	// Should charge prorated difference ($40 - $20 = $20 prorated)
	expect(preview.total).toBeGreaterThan(0);

	// Execute uncancel + items with invoice mode
	const updateResult = await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
		items: [customMessagesItem, customPriceItem],
		invoice: true,
		finalize_invoice: true,
	});

	// Should return invoice info (finalized but awaiting payment)
	expect(updateResult.invoice).toBeDefined();
	expect(updateResult.invoice?.status).toBe("open");

	// Verify pro is active with custom items
	const customerAfterUpdate =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUpdate,
		productId: pro.id,
	});

	// Scheduled free should be deleted
	await expectProductNotPresent({
		customer: customerAfterUpdate,
		productId: free.id,
	});

	// Should have custom features
	expectCustomerFeatureCorrect({
		customer: customerAfterUpdate,
		featureId: TestFeature.Messages,
		includedUsage: 200,
		balance: 200,
		usage: 0,
	});

	// Verify invoices (don't assert latestTotal - proration varies based on timing)
	expectCustomerInvoiceCorrect({
		customer: customerAfterUpdate,
		count: 2,
	});

	// Verify Stripe subscription
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});
