/**
 * Custom Line Items Tests (Attach V2)
 *
 * Tests that custom_line_items override the auto-generated proration line items
 * when upgrading a subscription.
 *
 * Key behaviors:
 * - Custom line items replace computed proration charges on the invoice
 * - The invoice total equals the sum of custom line items
 * - Preview response reflects custom line items
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, atmnToStripeAmount } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Upgrade with custom line items
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo)
 * - Upgrade to premium ($50/mo) with custom_line_items
 *
 * Expected Result:
 * - Invoice total equals sum of custom line items (not the $30 proration diff)
 * - Stripe invoice has exactly the custom line items
 */
test.concurrent(`${chalk.yellowBright("custom-line-items 1: upgrade with custom line items")}`, async () => {
	const customerId = "cli-upgrade-basic";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const customLineItems = [
		{ amount: 15, description: "Custom upgrade charge" },
		{ amount: 5, description: "Setup fee" },
	];

	// 1. Attach premium with custom line items
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
		custom_line_items: customLineItems,
	});

	// 2. Verify invoice was created
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	// 3. Retrieve Stripe invoice and verify line items
	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice!.stripe_id,
		{ expand: ["lines.data"] },
	);

	// Invoice total should be $20 (15 + 5), not $30 (normal proration)
	expect(stripeInvoice.total).toBe(
		atmnToStripeAmount({ amount: 20, currency: "usd" }),
	);

	// Should have exactly 2 line items
	expect(stripeInvoice.lines.data.length).toBe(2);

	// Verify each line item matches
	const lineDescriptions = stripeInvoice.lines.data.map(
		(line) => line.description,
	);
	expect(lineDescriptions).toContain("Custom upgrade charge");
	expect(lineDescriptions).toContain("Setup fee");

	// Verify amounts
	const lineAmounts = stripeInvoice.lines.data.map((line) => line.amount);
	expect(lineAmounts).toContain(
		atmnToStripeAmount({ amount: 15, currency: "usd" }),
	);
	expect(lineAmounts).toContain(
		atmnToStripeAmount({ amount: 5, currency: "usd" }),
	);

	// 4. Verify product states
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// 5. Verify Autumn invoice total
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2, // pro initial + upgrade
		latestTotal: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Preview with custom line items
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo)
 * - Preview upgrade to premium ($50/mo) with custom_line_items
 *
 * Expected Result:
 * - Preview total equals sum of custom line items
 * - Preview line_items reflect the custom items
 */
test.concurrent(`${chalk.yellowBright("custom-line-items 2: preview with custom line items")}`, async () => {
	const customerId = "cli-preview-basic";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const customLineItems = [
		{ amount: 10, description: "Prorated base" },
		{ amount: 3.5, description: "Prorated feature" },
	];

	// Preview upgrade with custom line items
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		custom_line_items: customLineItems,
	});

	// Total should be sum of custom line items: 10 + 3.5 = 13.5
	expect(preview.total).toBe(13.5);

	// Line items should reflect custom items
	expect(preview.line_items.length).toBe(2);

	const descriptions = preview.line_items.map(
		(li: { description: string }) => li.description,
	);
	expect(descriptions).toContain("Prorated base");
	expect(descriptions).toContain("Prorated feature");

	const amounts = preview.line_items.map((li: { amount: number }) => li.amount);
	expect(amounts).toContain(10);
	expect(amounts).toContain(3.5);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Single custom line item
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo)
 * - Upgrade to premium with a single custom line item
 *
 * Expected Result:
 * - Invoice has exactly 1 line item with the custom amount
 */
test.concurrent(`${chalk.yellowBright("custom-line-items 3: single custom line item")}`, async () => {
	const customerId = "cli-single-item";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
		custom_line_items: [{ amount: 42, description: "Flat upgrade fee" }],
	});

	expect(result.invoice).toBeDefined();

	const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
		result.invoice!.stripe_id,
		{ expand: ["lines.data"] },
	);

	expect(stripeInvoice.total).toBe(
		atmnToStripeAmount({ amount: 42, currency: "usd" }),
	);
	expect(stripeInvoice.lines.data.length).toBe(1);
	expect(stripeInvoice.lines.data[0].description).toBe("Flat upgrade fee");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Custom line items summing to zero — no invoice created
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo)
 * - Upgrade to premium ($50/mo) with custom_line_items that sum to $0
 *
 * Expected Result:
 * - Subscription update succeeds (premium replaces pro)
 * - No upgrade invoice is created (total is $0)
 * - Only the initial pro invoice exists (count: 1)
 * - Preview also shows total of $0
 */
test.concurrent(`${chalk.yellowBright("custom-line-items 4: zero-sum custom line items — no invoice")}`, async () => {
	const customerId = "cli-zero-sum";

	const messagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({ includedUsage: 1000 });
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const customLineItems = [
		{ amount: 15, description: "Upgrade charge" },
		{ amount: -15, description: "Loyalty credit" },
	];

	// 1. Preview should show total of $0
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: premium.id,
		custom_line_items: customLineItems,
	});

	expect(preview.total).toBe(0);
	expect(preview.line_items.length).toBe(2);

	// 2. Attach premium with zero-sum custom line items
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
		custom_line_items: customLineItems,
	});

	// 3. No upgrade invoice should be created (total is $0)
	expect(result.invoice).toBeUndefined();

	// 4. Verify product states — premium active, pro gone
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// 5. Only the initial pro invoice should exist (no upgrade invoice)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20, // Only the original pro subscription invoice
	});

	// 6. Verify Stripe subscription state is correct
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});
