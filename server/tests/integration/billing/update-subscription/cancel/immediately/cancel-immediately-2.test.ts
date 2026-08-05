/**
 * Cancel Immediately Tests (slice 2 of 2)
 *
 * Tests for the `cancel: 'immediately'` parameter in update subscription.
 * This cancels a subscription immediately (not at end of cycle).
 *
 * Key behaviors:
 * - Product is removed immediately
 * - Default product (if exists) becomes active immediately
 * - Stripe subscription is canceled immediately
 * - Refund invoice may be created for unused time
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Downgrade then cancel immediately (with default)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Premium ($50/mo)
 * - User downgrades to Pro ($20/mo) → Premium is canceling, Pro is scheduled
 * - Free default product exists
 * - User cancels Premium immediately
 *
 * Expected Result:
 * - Premium is removed immediately
 * - Pro scheduled product should also be REMOVED
 * - Free default becomes active
 * - Stripe subscription is canceled
 */
test.concurrent(
	`${chalk.yellowBright("cancel immediately: downgrade then cancel (with default)")}`,
	async () => {
		const customerId = "cancel-imm-downgrade-default";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });

		const free = products.base({
			id: "free",
			items: [messagesItem],
			isDefault: true,
		});

		const pro = products.pro({
			id: "pro",
			items: [messagesItem],
		});

		const premiumPriceItem = items.monthlyPrice({ price: 50 });
		const premium = products.base({
			id: "premium",
			items: [messagesItem, premiumPriceItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, pro, premium] }),
			],
			actions: [
				s.attach({ productId: premium.id }),
				s.attach({ productId: pro.id }), // Downgrade: premium canceling, pro scheduled
			],
		});

		// Verify initial invoice for premium
		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 1,
			latestTotal: 50, // Premium base price
		});

		// Preview cancel to get expected refund
		const cancelParams = {
			customer_id: customerId,
			product_id: premium.id,
			cancel_action: "cancel_immediately" as const,
		};
		const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

		// At start of cycle, refund should be full premium amount (negative)
		expect(preview.total).toBe(-50); // $50 refund

		// Cancel premium immediately
		await autumnV1.subscriptions.update(cancelParams);

		// Verify premium and pro are gone, free is active
		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [premium.id, pro.id],
			active: [free.id],
		});

		// Verify invoice matches preview (refund invoice)
		expectCustomerInvoiceCorrect({
			customer: customerAfterCancel,
			count: 2,
			latestTotal: preview.total,
		});

		// Verify no Stripe subscription exists (canceled, free has no price)
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Cancel pro with multi-interval items immediately
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User is on Pro with monthly messages + annual base price (multi-interval)
 * - User cancels Pro immediately
 *
 * Expected Result:
 * - Pro is removed immediately
 * - No products attached
 * - Stripe subscription is canceled
 */
test.concurrent(
	`${chalk.yellowBright("cancel immediately: multi-interval product")}`,
	async () => {
		const customerId = "cancel-imm-multi-interval";

		const prepaidMessagesItem = items.prepaidMessages({ includedUsage: 0 });
		const annualPriceItem = items.annualPrice({ price: 200 });

		const pro = products.base({
			id: "pro",
			items: [prepaidMessagesItem, annualPriceItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		// Verify pro is active and initial invoice
		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfterAttach,
			active: [pro.id],
		});
		expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 1,
			latestTotal: 210, // $10 prepaid + $200 annual
		});

		// Preview cancel to get expected refund
		const cancelParams = {
			customer_id: customerId,
			product_id: pro.id,
			cancel_action: "cancel_immediately" as const,
		};
		const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

		// At start of cycle, refund should be full amount (negative)
		expect(preview.total).toBe(-210); // $10 prepaid + $200 annual refund

		// Cancel pro immediately
		await autumnV1.subscriptions.update(cancelParams);

		// Verify pro is gone, no products attached
		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [pro.id],
		});
		expect(customerAfterCancel.products.length).toBe(0);

		// Verify invoice matches preview (refund invoice)
		expectCustomerInvoiceCorrect({
			customer: customerAfterCancel,
			count: 2,
			latestTotal: preview.total,
		});

		// Verify no Stripe subscription exists (canceled)
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7: Cancel one-off prepaid product immediately
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - User purchases one-off prepaid messages (2 packs = 200 messages)
 * - User cancels the one-off product immediately
 *
 * Expected Result:
 * - Product is removed immediately
 * - No products attached
 * - No Stripe subscription (one-off products don't create subscriptions)
 */
test.concurrent(
	`${chalk.yellowBright("cancel immediately: one-off prepaid product")}`,
	async () => {
		const customerId = "cancel-imm-oneoff";

		const oneOffMessagesItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const oneOffProduct = products.base({
			id: "oneoff",
			items: [oneOffMessagesItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [oneOffProduct] }),
			],
			actions: [
				s.attach({
					productId: oneOffProduct.id,
					options: [{ feature_id: "messages", quantity: 200 }], // 2 packs
				}),
			],
		});

		// Verify one-off product is active and initial invoice
		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfterAttach,
			active: [oneOffProduct.id],
		});
		expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 1,
			latestTotal: 20, // 2 packs * $10 = $20
		});

		// Preview cancel - one-off products don't get refunds
		const cancelParams = {
			customer_id: customerId,
			product_id: oneOffProduct.id,
			cancel_action: "cancel_immediately" as const,
		};
		const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

		// One-off products don't generate refund line items
		expect(preview.total).toBe(0);

		// Cancel one-off product immediately
		await autumnV1.subscriptions.update(cancelParams);

		// Verify one-off product is gone, no products attached
		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [oneOffProduct.id],
		});
		expect(customerAfterCancel.products.length).toBe(0);

		// Verify no new invoice created (no refund for one-off)
		expectCustomerInvoiceCorrect({
			customer: customerAfterCancel,
			count: 1, // Still just the original invoice
		});

		// Verify no Stripe subscription exists (one-off products don't create subscriptions)
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Cancel one-off product immediately (with free default) - should NOT attach default
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Free default product exists
 * - User purchases one-off prepaid messages (2 packs = 200 messages)
 * - User cancels the one-off product immediately
 *
 * Expected Result:
 * - One-off product is removed immediately
 * - Free default product is NOT attached (one-off cancellation shouldn't trigger default)
 * - No products attached
 * - No Stripe subscription
 */
test.concurrent(
	`${chalk.yellowBright("cancel immediately: one-off product does not create free default")}`,
	async () => {
		const customerId = "cancel-imm-oneoff-no-default";

		const messagesItem = items.monthlyMessages({ includedUsage: 50 });

		const free = products.base({
			id: "free",
			items: [messagesItem],
			isDefault: true,
		});

		const oneOffMessagesItem = items.oneOffMessages({
			includedUsage: 0,
			billingUnits: 100,
			price: 10,
		});

		const oneOffProduct = products.base({
			id: "oneoff",
			items: [oneOffMessagesItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [free, oneOffProduct] }),
			],
			actions: [
				s.attach({
					productId: oneOffProduct.id,
					options: [{ feature_id: "messages", quantity: 200 }], // 2 packs
				}),
			],
		});

		// Verify one-off product is active and free is NOT attached
		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfterAttach,
			active: [oneOffProduct.id],
			notPresent: [free.id],
		});
		expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 1,
			latestTotal: 20, // 2 packs * $10 = $20
		});

		// Cancel one-off product immediately
		const cancelParams = {
			customer_id: customerId,
			product_id: oneOffProduct.id,
			cancel_action: "cancel_immediately" as const,
		};
		await autumnV1.subscriptions.update(cancelParams);

		// Verify one-off product is gone and free default is NOT attached
		const customerAfterCancel =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfterCancel,
			notPresent: [oneOffProduct.id, free.id],
		});

		// No products should be attached (default should NOT be triggered for one-off)
		expect(customerAfterCancel.products.length).toBe(0);

		// Verify no new invoice created (no refund for one-off)
		expectCustomerInvoiceCorrect({
			customer: customerAfterCancel,
			count: 1, // Still just the original invoice
		});

		// Verify no Stripe subscription exists
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
