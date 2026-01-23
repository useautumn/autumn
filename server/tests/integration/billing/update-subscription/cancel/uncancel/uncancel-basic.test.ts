import { expect, test } from "bun:test";
import { type ApiCustomerV3, ErrCode } from "@autumn/shared";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts";

/**
 * Uncancel Basic Tests
 *
 * Core uncancel functionality and error cases.
 * Tests: cancel_action: "uncancel" via subscriptions.update()
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Uncancel with scheduled default product
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("uncancel: with scheduled default product")}`, async () => {
	const customerId = "uncancel-with-default";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 10 });

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
			s.customer({ paymentMethod: "success" }),
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

	// Uncancel via subscriptions.update with cancel_action: "uncancel"
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
	});

	// Verify pro is now active (not canceling)
	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: pro.id,
	});

	// Scheduled free product should be deleted
	await expectProductNotPresent({
		customer: customerAfterUncancel,
		productId: free.id,
	});

	// Verify balance unchanged (still 100 from pro)
	expect(customerAfterUncancel.features?.[TestFeature.Messages]?.balance).toBe(
		100,
	);

	// Verify Stripe subscription is correct (cancel_at cleared, schedule released)
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Uncancel already active product (no-op)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("uncancel: already active (no-op)")}`, async () => {
	const customerId = "uncancel-noop";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Verify pro is active (not canceling)
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerBefore,
		productId: pro.id,
	});

	// Uncancel on already active product - should be a no-op
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
	});

	// Verify pro is still active
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfter,
		productId: pro.id,
	});

	// Balance unchanged
	expect(customerAfter.features?.[TestFeature.Messages]?.balance).toBe(100);

	// Stripe subscription correct
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Uncancel preserves usage
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("uncancel: preserves usage")}`, async () => {
	const customerId = "uncancel-usage";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ items: [messagesItem] });

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id, timeout: 4000 })],
	});

	// Track some usage (the timeout waits after track completes)
	const messagesUsage = 40;
	await autumnV1.track(
		{
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: messagesUsage,
		},
		{ timeout: 4000 },
	);

	// Verify usage tracked
	const customerWithUsage =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerWithUsage.features?.[TestFeature.Messages]?.usage).toBe(
		messagesUsage,
	);

	// Cancel pro via subscriptions.update
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "cancel_end_of_cycle",
	});

	await new Promise((resolve) => setTimeout(resolve, 4000));

	// Verify pro is canceling
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductCanceling({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	// Uncancel
	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: pro.id,
		cancel_action: "uncancel",
	});

	await new Promise((resolve) => setTimeout(resolve, 4000));

	// Verify pro is active and usage preserved
	const customerAfterUncancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterUncancel,
		productId: pro.id,
	});

	// Usage should be preserved
	expect(customerAfterUncancel.features?.[TestFeature.Messages]?.usage).toBe(
		messagesUsage,
	);
	expect(customerAfterUncancel.features?.[TestFeature.Messages]?.balance).toBe(
		100 - messagesUsage,
	);

	// Stripe subscription correct
	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
		shouldBeCanceled: false,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Error - cannot uncancel scheduled product
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("error: uncancel scheduled product")}`, async () => {
	const customerId = "uncancel-err-scheduled";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 500 });

	const pro = products.pro({ items: [messagesItem] });
	const premium = constructProduct({
		id: "premium",
		items: [premiumMessagesItem],
		type: "premium",
		isDefault: false,
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
		],
		actions: [s.attach({ productId: premium.id })],
	});

	// Downgrade from premium to pro - pro becomes scheduled
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	// Verify pro is scheduled
	const customerAfterDowngrade =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductScheduled({
		customer: customerAfterDowngrade,
		productId: pro.id,
	});

	// Try to uncancel the scheduled product - should error
	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "uncancel",
			});
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Error - cannot uncancel expired product
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("error: uncancel expired product")}`, async () => {
	const customerId = "uncancel-err-expired";
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const freeMessagesItem = items.monthlyMessages({ includedUsage: 10 });

	const pro = products.pro({ items: [messagesItem] });
	const free = constructProduct({
		id: "free",
		items: [freeMessagesItem],
		type: "free",
		isDefault: true,
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
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

	// Advance to next billing cycle so pro expires
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// Verify pro is expired (free should be active now)
	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterAdvance,
		productId: pro.id,
	});
	await expectProductActive({
		customer: customerAfterAdvance,
		productId: free.id,
	});

	// Try to uncancel the expired product - should error
	await expectAutumnError({
		errCode: ErrCode.InternalError,
		func: async () => {
			await autumnV1.subscriptions.update({
				customer_id: customerId,
				product_id: pro.id,
				cancel_action: "uncancel",
			});
		},
	});
});
