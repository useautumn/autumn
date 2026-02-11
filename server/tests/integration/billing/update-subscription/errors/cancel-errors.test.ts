/**
 * Cancel Error Tests
 *
 * Tests for error cases when using cancel functionality in update subscription.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, ErrCode, FreeTrialDuration } from "@autumn/shared";
import {
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Cannot cancel a scheduled product
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Premium ($50/mo)
 * - User downgrades to Pro ($20/mo) → Premium is canceling, Pro is scheduled
 * - User tries to cancel Pro (the scheduled product)
 *
 * Expected Result:
 * - Should return an error - cannot cancel a scheduled product
 */
test.concurrent(`${chalk.yellowBright("error: cannot cancel scheduled product")}`, async () => {
	const customerId = "err-cancel-scheduled";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const premiumPriceItem = items.monthlyPrice({ price: 50 });
	const premium = products.base({
		id: "premium",
		items: [messagesItem, premiumPriceItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.attach({ productId: premium.id }),
			s.attach({ productId: pro.id }), // Downgrade: premium canceling, pro scheduled
		],
	});

	// Verify pro is scheduled
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

	// Try to cancel the scheduled product - should fail
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_immediately",
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Cancel immediately twice - second cancel is a no-op
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Pro ($20/mo)
 * - User cancels Pro immediately
 * - User tries to cancel Pro again
 *
 * Expected Result:
 * - First cancel removes the product
 * - Second cancel should fail because product doesn't exist
 */
test.concurrent(`${chalk.yellowBright("error: cancel non-existent product")}`, async () => {
	const customerId = "err-cancel-twice";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Cancel pro immediately
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_immediately",
	});

	// Verify pro is gone
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});
	expect(customerAfterCancel.products.length).toBe(0);

	// Try to cancel again - should fail because product doesn't exist
	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_immediately",
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Cannot combine cancel_action with other update params
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Pro ($20/mo)
 * - User tries to cancel while also passing options, version, items, or free_trial
 *
 * Expected Result:
 * - Should return an error for each invalid combination
 */
test.concurrent(`${chalk.yellowBright("error: cancel_action with other params")}`, async () => {
	const customerId = "err-cancel-with-params";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Cannot combine cancel with options
	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_immediately",
				options: [{ feature_id: "messages", quantity: 200 }],
			});
		},
	});

	// Cannot combine cancel with version
	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_immediately",
				version: 2,
			});
		},
	});

	// Cannot combine cancel with items
	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_immediately",
				items: [messagesItem],
			});
		},
	});

	// Cannot combine cancel with free_trial
	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_immediately",
				free_trial: {
					length: 7,
					duration: FreeTrialDuration.Day,
					card_required: true,
				},
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Cannot cancel free product with end_of_cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User has a free product (no subscription)
 * - User tries to cancel with end_of_cycle
 *
 * Expected Result:
 * - Should return an error - free products can only be canceled immediately
 */
test.concurrent(`${chalk.yellowBright("error: cannot cancel free product with end_of_cycle")}`, async () => {
	const customerId = "err-cancel-free-eoc";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const free = products.base({
		id: "free",
		items: [messagesItem],
		isDefault: true,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [free] })],
		actions: [s.attach({ productId: free.id })],
	});

	// Try to cancel free product with end_of_cycle - should fail
	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: free.id,
				cancel_action: "cancel_end_of_cycle",
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Cannot cancel one-time product with end_of_cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User has a one-time product (no recurring subscription)
 * - User tries to cancel with end_of_cycle
 *
 * Expected Result:
 * - Should return an error - one-time products can only be canceled immediately
 */
test.concurrent(`${chalk.yellowBright("error: cannot cancel one-time product with end_of_cycle")}`, async () => {
	const customerId = "err-cancel-onetime-eoc";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const oneTime = products.oneOff({
		id: "onetime",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneTime] }),
		],
		actions: [s.attach({ productId: oneTime.id })],
	});

	// Try to cancel one-time product with end_of_cycle - should fail
	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: oneTime.id,
				cancel_action: "cancel_end_of_cycle",
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Cannot pass items when cancel is end_of_cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Pro ($20/mo)
 * - User tries to cancel at end of cycle while also passing items
 *
 * Expected Result:
 * - Should return an error - cannot combine cancel_end_of_cycle with items
 */
test.concurrent(`${chalk.yellowBright("error: cannot pass items when cancel is end_of_cycle")}`, async () => {
	const customerId = "err-cancel-eoc-with-items";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Try to cancel end_of_cycle while also passing items - should fail
	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
				items: [items.monthlyMessages({ includedUsage: 200 })],
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Cannot pass options when cancel is end_of_cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Pro with prepaid messages
 * - User tries to cancel at end of cycle while also passing options
 *
 * Expected Result:
 * - Should return an error - cannot combine cancel_end_of_cycle with options
 */
test.concurrent(`${chalk.yellowBright("error: cannot pass options when cancel is end_of_cycle")}`, async () => {
	const customerId = "err-cancel-eoc-with-options";

	const prepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: "messages", quantity: 300 }],
			}),
		],
	});

	// Try to cancel end_of_cycle while also passing options - should fail
	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "cancel_end_of_cycle",
				options: [{ feature_id: "messages", quantity: 500 }],
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Cannot pass free_trial when cancel is end_of_cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Pro with trial
 * - User tries to cancel at end of cycle while also passing free_trial
 *
 * Expected Result:
 * - Should return an error - cannot combine cancel: 'end_of_cycle' with free_trial
 */
test.concurrent(`${chalk.yellowBright("error: cannot pass free_trial when cancel is end_of_cycle")}`, async () => {
	const customerId = "err-cancel-eoc-with-trial";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	const proTrial = products.proWithTrial({
		id: "pro-trial",
		items: [messagesItem],
		trialDays: 7,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [s.attach({ productId: proTrial.id })],
	});

	// Try to cancel end_of_cycle while also passing free_trial - should fail
	await expectAutumnError({
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: proTrial.id,
				cancel_action: "cancel_end_of_cycle",
				free_trial: {
					length: 14,
					duration: FreeTrialDuration.Day,
					card_required: true,
				},
			});
		},
	});
});
