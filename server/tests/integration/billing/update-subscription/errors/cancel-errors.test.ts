/**
 * Cancel Error Tests
 *
 * Tests for error cases when using cancel functionality in update subscription.
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, ErrCode } from "@autumn/shared";
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
				cancel: "immediately",
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
		cancel: "immediately",
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
				cancel: "immediately",
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Cannot combine cancel immediately with options
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Pro ($20/mo) with prepaid messages
 * - User tries to cancel immediately while also updating options (quantity)
 *
 * Expected Result:
 * - Should return an error - cannot combine cancel with options
 */
test.concurrent(`${chalk.yellowBright("error: cancel immediately with options")}`, async () => {
	const customerId = "err-cancel-with-options";

	const messagesItem = items.prepaidMessages({ includedUsage: 0 });

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
		actions: [
			s.attach({
				productId: pro.id,
				options: [{ feature_id: "messages", quantity: 100 }],
			}),
		],
	});

	// Try to cancel immediately while also updating options - should fail
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel: "immediately",
				options: [{ feature_id: "messages", quantity: 200 }],
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Cannot combine cancel immediately with version
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Pro ($20/mo)
 * - User tries to cancel immediately while also specifying a version
 *
 * Expected Result:
 * - Should return an error - cannot combine cancel with version
 */
test.concurrent(`${chalk.yellowBright("error: cancel immediately with version")}`, async () => {
	const customerId = "err-cancel-with-version";

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

	// Try to cancel immediately while also specifying version - should fail
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel: "immediately",
				version: 2,
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Cannot combine cancel immediately with items
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Pro ($20/mo)
 * - User tries to cancel immediately while also specifying custom items
 *
 * Expected Result:
 * - Should return an error - cannot combine cancel with items
 */
test.concurrent(`${chalk.yellowBright("error: cancel immediately with items")}`, async () => {
	const customerId = "err-cancel-with-items";

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

	// Try to cancel immediately while also specifying custom items - should fail
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel: "immediately",
				items: [messagesItem],
			});
		},
	});
});
