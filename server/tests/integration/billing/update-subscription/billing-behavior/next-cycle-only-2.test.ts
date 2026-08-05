import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
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
 * Slice 2 of 2 (see next-cycle-only.test.ts for slice 1).
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

test.concurrent(
	`${chalk.yellowBright("next_cycle_only: paid-to-paid price decrease - no immediate credit")}`,
	async () => {
		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 30 });
		const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "bb-p2p-dec-no-credit",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: "pro" })],
		});

		// Decrease price from $30 to $20
		const newPriceItem = items.monthlyPrice({ price: 20 });
		const baseUpdateParams = {
			customer_id: customerId,
			product_id: pro.id,
			items: [messagesItem, newPriceItem],
		};

		// Preview WITHOUT billing_behavior shows proration credit
		const normalPreview =
			await autumnV1.subscriptions.previewUpdate(baseUpdateParams);
		expect(normalPreview.total).toBe(-10); // $20 - $30 = -$10

		// Preview WITH next_cycle_only shows 0
		const deferredPreview = await autumnV1.subscriptions.previewUpdate({
			...baseUpdateParams,
			billing_behavior: "none",
		});
		expect(deferredPreview.total).toBe(0); // Nothing credited now

		// Execute update with next_cycle_only
		await autumnV1.subscriptions.update({
			...baseUpdateParams,
			billing_behavior: "none",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

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

// ═══════════════════════════════════════════════════════════════════════════════
// COMPARISON: prorate_immediately (default) vs next_cycle_only
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("comparison: prorate_immediately creates invoice, next_cycle_only does not")}`,
	async () => {
		const billingUnits = 1;
		const pricePerUnit = 10;

		const prepaidImmediate = items.prepaid({
			featureId: TestFeature.Messages,
			billingUnits,
			price: pricePerUnit,
		});
		const prepaidDeferred = items.prepaid({
			featureId: TestFeature.Messages,
			billingUnits,
			price: pricePerUnit,
		});

		const proImmediate = products.base({
			id: "pro-imm",
			items: [prepaidImmediate],
		});
		const proDeferred = products.base({
			id: "pro-def",
			items: [prepaidDeferred],
		});

		const { customerId: customerImmediate, autumnV1: autumnImmediate } =
			await initScenario({
				customerId: "bb-compare-immediate",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [proImmediate] }),
				],
				actions: [
					s.attach({
						productId: "pro-imm",
						options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
					}),
				],
			});

		const { customerId: customerDeferred, autumnV1: autumnDeferred } =
			await initScenario({
				customerId: "bb-compare-deferred",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [proDeferred] }),
				],
				actions: [
					s.attach({
						productId: "pro-def",
						options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
					}),
				],
			});

		// Preview for immediate - should show charge
		const immediatePreview = await autumnImmediate.subscriptions.previewUpdate({
			customer_id: customerImmediate,
			product_id: proImmediate.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 10 }],
			billing_behavior: "prorate_immediately",
		});
		expect(immediatePreview.total).toBeGreaterThan(0);

		// Preview for deferred - should show 0
		const deferredPreview = await autumnDeferred.subscriptions.previewUpdate({
			customer_id: customerDeferred,
			product_id: proDeferred.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 10 }],
			billing_behavior: "none",
		});
		expect(deferredPreview.total).toBe(0);

		// Update both to 10 units - one with immediate, one with deferred
		await autumnImmediate.subscriptions.update({
			customer_id: customerImmediate,
			product_id: proImmediate.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 10 }],
			billing_behavior: "prorate_immediately",
		});

		await autumnDeferred.subscriptions.update({
			customer_id: customerDeferred,
			product_id: proDeferred.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 10 }],
			billing_behavior: "none",
		});

		const customerImmediateAfter =
			await autumnImmediate.customers.get<ApiCustomerV3>(customerImmediate);
		const customerDeferredAfter =
			await autumnDeferred.customers.get<ApiCustomerV3>(customerDeferred);

		// Both should have 10 entitlements
		expect(
			customerImmediateAfter.features?.[TestFeature.Messages]?.balance,
		).toBe(10);
		expect(
			customerDeferredAfter.features?.[TestFeature.Messages]?.balance,
		).toBe(10);

		// Immediate should have 2 invoices (attach + proration)
		await expectCustomerInvoiceCorrect({
			customer: customerImmediateAfter,
			count: 2,
		});

		// Deferred should have 1 invoice (only attach)
		await expectCustomerInvoiceCorrect({
			customer: customerDeferredAfter,
			count: 1,
		});
	},
);

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT BEHAVIOR (no billing_behavior specified)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("default behavior: prorate_immediately when no billing_behavior specified")}`,
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
			customerId: "bb-default-behavior",
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

		// Update WITHOUT specifying billing_behavior (should default to prorate_immediately)
		const updateParams = {
			customer_id: customerId,
			product_id: pro.id,
			options: [{ feature_id: TestFeature.Messages, quantity: 10 }],
		};

		const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
		expect(preview.total).toBeGreaterThan(0); // Should show proration charge

		await autumnV1.subscriptions.update(updateParams);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		// Entitlements updated
		expect(customer.features?.[TestFeature.Messages]?.balance).toBe(10);

		// Should have 2 invoices (attach + proration) - default is prorate_immediately
		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
