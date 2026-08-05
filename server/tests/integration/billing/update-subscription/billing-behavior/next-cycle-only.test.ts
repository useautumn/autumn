import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Billing Behavior: next_cycle_only Tests
 *
 * Slice 1 of 2 (see next-cycle-only-2.test.ts for slice 2).
 *
 * Tests for billing_behavior: 'next_cycle_only' which defers all charges
 * to the next billing cycle instead of charging immediately.
 *
 * Key behaviors:
 * - No proration invoice is created
 * - Subscription is still updated in Stripe
 * - Entitlements ARE updated immediately
 * - Only billing is deferred to next cycle
 * - Preview with next_cycle_only returns 0 (nothing charged now)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// QUANTITY UPDATES WITH next_cycle_only
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("next_cycle_only: increase quantity - no immediate charge")}`,
	async () => {
		const billingUnits = 1;
		const pricePerUnit = 10;

		const prepaidItem = items.prepaid({
			featureId: TestFeature.Messages,
			billingUnits,
			price: pricePerUnit,
		});
		const pro = products.base({ id: "pro", items: [prepaidItem] });

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "bb-inc-qty-no-charge",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({
					productId: "pro",
					options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
				}),
			],
		});

		// Verify initial state: 5 units @ $10 = $50
		const customerBefore =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expect(customerBefore.features?.[TestFeature.Messages]?.balance).toBe(5);

		const baseUpdateParams = {
			customer_id: customerId,
			product_id: pro.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 10 }],
		};

		// Preview WITHOUT billing_behavior shows what would normally be charged
		const normalPreview =
			await autumnV1.subscriptions.previewUpdate(baseUpdateParams);
		expect(normalPreview.total).toBeGreaterThan(0); // Would charge for 5 more units

		// Preview WITH next_cycle_only shows 0 (nothing charged now)
		const deferredPreview = await autumnV1.subscriptions.previewUpdate({
			...baseUpdateParams,
			billing_behavior: "none",
		});
		expect(deferredPreview.total).toBe(0); // Nothing charged immediately

		// Execute update with next_cycle_only
		await autumnV1.subscriptions.update({
			...baseUpdateParams,
			billing_behavior: "none",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Entitlements should be updated immediately to 10
		expect(customer.features?.[TestFeature.Messages]?.balance).toBe(10);

		// NO new invoice should be created (only initial attach invoice)
		await expectCustomerInvoiceCorrect({
			customer,
			count: 1, // Only initial attach, no proration invoice
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("next_cycle_only: decrease quantity - no immediate credit")}`,
	async () => {
		const billingUnits = 1;
		const pricePerUnit = 10;

		const prepaidItem = items.prepaid({
			featureId: TestFeature.Messages,
			billingUnits,
			price: pricePerUnit,
		});
		const pro = products.base({ id: "pro", items: [prepaidItem] });

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "bb-dec-qty-no-credit",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.attach({
					productId: "pro",
					options: [{ feature_id: TestFeature.Messages, quantity: 10 }],
				}),
			],
		});

		const baseUpdateParams = {
			customer_id: customerId,
			product_id: pro.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
		};

		// Preview WITHOUT billing_behavior shows what would normally be credited
		const normalPreview =
			await autumnV1.subscriptions.previewUpdate(baseUpdateParams);
		expect(normalPreview.total).toBeLessThan(0); // Would credit for 5 units

		// Preview WITH next_cycle_only shows 0 (nothing credited now)
		const deferredPreview = await autumnV1.subscriptions.previewUpdate({
			...baseUpdateParams,
			billing_behavior: "none",
		});
		expect(deferredPreview.total).toBe(0); // Nothing credited immediately

		// Execute update with next_cycle_only
		await autumnV1.subscriptions.update({
			...baseUpdateParams,
			billing_behavior: "none",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Entitlements should be updated immediately to 5
		expect(customer.features?.[TestFeature.Messages]?.balance).toBe(5);

		// NO new invoice should be created (only initial attach invoice)
		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// PLAN CHANGES WITH next_cycle_only
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("next_cycle_only: paid-to-paid price increase - no immediate charge")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "bb-p2p-inc-no-charge",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Increase price from $20 to $30
		const newPriceItem = items.monthlyPrice({ price: 30 });
		const baseUpdateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [messagesItem, newPriceItem],
		};

		// Preview WITHOUT billing_behavior shows proration charge
		const normalPreview =
			await autumnV1.subscriptions.previewUpdate(baseUpdateParams);
		expect(normalPreview.total).toBe(10); // $30 - $20 = $10 difference

		// Preview WITH next_cycle_only shows 0
		const deferredPreview = await autumnV1.subscriptions.previewUpdate({
			...baseUpdateParams,
			billing_behavior: "none",
		});
		expect(deferredPreview.total).toBe(0); // Nothing charged now

		// Execute update with next_cycle_only
		await autumnV1.subscriptions.update({
			...baseUpdateParams,
			billing_behavior: "none",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Features should remain unchanged
		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: messagesItem.included_usage,
			balance: messagesItem.included_usage,
			usage: 0,
		});

		// NO new invoice (only initial attach invoice)
		await expectCustomerInvoiceCorrect({
			customer,
			count: 1,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
