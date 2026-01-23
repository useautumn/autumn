import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli";

/**
 * Refund Behavior: refund_payment_method Tests
 *
 * Tests for refund_behavior: 'refund_payment_method' which issues a refund
 * to the customer's payment method when the invoice total is negative.
 *
 * Key behaviors:
 * - Only applies when invoice total is negative (downgrade scenarios)
 * - Refund is issued via Stripe to the original payment method
 * - Default behavior (grant_invoice_credits) applies credits to customer balance instead
 */

// ═══════════════════════════════════════════════════════════════════════════════
// REFUND ON DOWNGRADE
// ═══════════════════════════════════════════════════════════════════════════════

test.skip(`${chalk.yellowBright("refund_payment_method: price decrease issues refund")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx, customer } = await initScenario({
		customerId: "rb-refund-price-dec",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	const stripeCustomerId = customer?.processor?.id;
	expect(stripeCustomerId).toBeDefined();

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	// Decrease price from $30 to $20 (should create negative invoice / refund)
	const newPriceItem = items.monthlyPrice({ price: 20 });
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, newPriceItem],
		refund_behavior: "refund_payment_method" as const,
	};

	// Preview shows negative total (credit)
	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	expect(preview.total).toBe(-10); // $20 - $30 = -$10

	// Execute update with refund_payment_method
	await autumnV1.subscriptions.update(updateParams);

	// Wait for Stripe to process
	await new Promise((resolve) => setTimeout(resolve, 1000));

	// Get refunds to verify refund was issued
	const refunds = await stripeCli.refunds.list({
		limit: 10,
	});

	// Find the refund we just created (should be $10 = 1000 cents)
	const ourRefund = refunds.data.find(
		(r: { amount: number }) => r.amount === 1000,
	);
	expect(ourRefund).toBeDefined();
	expect(ourRefund!.status).toBe("succeeded");

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: -10,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

test.skip(`${chalk.yellowBright("refund_payment_method: quantity decrease issues refund")}`, async () => {
	const billingUnits = 1;
	const pricePerUnit = 10;

	const prepaidItem = items.prepaid({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});
	const pro = products.base({ id: "pro", items: [prepaidItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "rb-refund-qty-dec",
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

	// Decrease quantity from 10 to 5 (should create negative invoice)
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 5 }],
		refund_behavior: "refund_payment_method" as const,
	};

	// Preview shows negative total (credit)
	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	expect(preview.total).toBeLessThan(0); // Should be negative

	// Execute update with refund_payment_method
	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Entitlements should be updated to 5
	expect(customer.features?.[TestFeature.Messages]?.balance).toBe(5);

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT BEHAVIOR: grant_invoice_credits
// ═══════════════════════════════════════════════════════════════════════════════

test.skip(`${chalk.yellowBright("grant_invoice_credits: default behavior on downgrade")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const priceItem = items.monthlyPrice({ price: 30 });
	const pro = products.base({ id: "pro", items: [messagesItem, priceItem] });

	const { customerId, autumnV1, ctx } = await initScenario({
		customerId: "rb-credits-default",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Decrease price from $30 to $20
	const newPriceItem = items.monthlyPrice({ price: 20 });
	const updateParams = {
		customer_id: customerId,
		product_id: pro.id,
		items: [messagesItem, newPriceItem],
		// No refund_behavior specified - defaults to grant_invoice_credits
	};

	// Preview shows negative total
	const preview = await autumnV1.subscriptions.previewUpdate(updateParams);
	expect(preview.total).toBe(-10);

	// Execute update (default: grant_invoice_credits)
	await autumnV1.subscriptions.update(updateParams);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
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
});
