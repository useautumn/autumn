/**
 * New Plan Misc Tests (Attach V2)
 *
 * Tests for miscellaneous new plan attachment scenarios including invoice line item persistence.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { invoiceLineItemRepo } from "@/internal/invoices/lineItems/repos";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Attach pro with all feature types - verify line items persisted
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has no existing product
 * - Attach Pro ($20/mo) with mixed features:
 *   - Free messages (100 included)
 *   - Prepaid messages ($10/100 units) - purchase 200
 *   - Consumable words (50 included)
 *   - Allocated users (3 included) - create 5 entities = 2 overage
 *
 * Expected Result:
 * - Invoice created with line items persisted to DB
 * - Line items include:
 *   - Base price ($20) charge
 *   - Prepaid messages (2 packs × $10 = $20) charge
 *   - Allocated users overage (2 × $10 = $20) charge
 * - Total: $60
 * - Each line item has prorated: false (start of cycle)
 * - Each line item has billing_timing: "in_advance" for prepaid/allocated
 */
test.concurrent(`${chalk.yellowBright("new-plan-misc 1: attach pro with all feature types - line items persisted")}`, async () => {
	const customerId = "new-plan-line-items-all-features";

	// Pro product with all feature types
	const freeMessages = items.monthlyMessages({ includedUsage: 100 });
	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const consumableWords = items.consumableWords({ includedUsage: 50 });
	const allocatedUsers = items.allocatedUsers({ includedUsage: 3 });

	const pro = products.pro({
		id: "pro-all-features",
		items: [freeMessages, prepaidMessages, consumableWords, allocatedUsers],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 5, featureId: TestFeature.Users }), // 5 users, 2 over included
		],
		actions: [],
	});

	// Attach pro with prepaid quantity
	// Base ($20) + Prepaid (2 packs = $20) + Allocated overage (2 seats = $20) = $60
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		redirect_mode: "if_required",
	});

	// Verify invoice was created
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product is active
	await expectProductActive({
		customer,
		productId: pro.id,
	});

	// Verify features
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: 100 + 200, // 100 free + 200 prepaid
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: 50,
		balance: 50,
	});

	// Users: 3 included, 5 created = 5 total (balance shows available, usage shows used)
	// With allocated, balance = included - usage overage charged
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 3,
		usage: 5,
	});

	// Verify invoice total: base ($20) + prepaid ($20) + allocated ($20) = $60
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 60,
	});

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify invoice line items are persisted to DB
	// ═══════════════════════════════════════════════════════════════════════════════

	const lineItems = await invoiceLineItemRepo.getByStripeInvoiceId({
		db: ctx.db,
		stripeInvoiceId: result.invoice!.stripe_id,
	});

	// Should have multiple line items
	expect(lineItems.length).toBeGreaterThan(0);

	// Verify each line item has required fields populated
	for (const lineItem of lineItems) {
		// Core fields
		expect(lineItem.id).toBeDefined();
		expect(lineItem.id.startsWith("invoice_li_")).toBe(true);
		expect(lineItem.stripe_invoice_id).toBe(result.invoice!.stripe_id);
		expect(lineItem.stripe_invoice_id).toBeDefined();

		// Amount fields
		expect(typeof lineItem.amount).toBe("number");
		expect(typeof lineItem.amount_after_discounts).toBe("number");
		expect(lineItem.currency).toBe("usd");

		// Direction field - all should be charges for new plan
		expect(lineItem.direction).toBe("charge");

		// Product relationship
		expect(lineItem.product_id).toBeDefined();
		expect(lineItem.price_id).toBeDefined();

		// New plan attachment = not prorated (start of cycle)
		expect(lineItem.prorated).toBe(false);
	}

	// Verify base price line item exists
	const basePriceItems = lineItems.filter(
		(li) => !li.feature_id && li.amount === 20,
	);
	expect(basePriceItems.length).toBe(1);

	// Verify prepaid messages line items exist
	const prepaidItems = lineItems.filter(
		(li) =>
			li.feature_id === TestFeature.Messages &&
			li.billing_timing === "in_advance",
	);
	expect(prepaidItems.length).toBeGreaterThan(0);

	// Calculate prepaid total (should be $20 for 2 packs)
	const prepaidTotal = prepaidItems.reduce((sum, li) => sum + li.amount, 0);
	expect(prepaidTotal).toBe(20);

	// Verify allocated users line items exist (2 overage seats × $10 = $20)
	const allocatedItems = lineItems.filter(
		(li) => li.feature_id === TestFeature.Users,
	);
	expect(allocatedItems.length).toBeGreaterThan(0);

	// Calculate allocated total (should be $20 for 2 overage seats)
	const allocatedTotal = allocatedItems.reduce((sum, li) => sum + li.amount, 0);
	expect(allocatedTotal).toBe(20);

	// Verify total matches invoice
	const lineItemsTotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
	expect(lineItemsTotal).toBe(60);

	// Log for debugging
	console.log(`Line items count: ${lineItems.length}`);
	console.log(
		`Line items: ${JSON.stringify(
			lineItems.map((li) => ({
				id: li.id,
				feature_id: li.feature_id,
				amount: li.amount,
				description: li.description,
			})),
			null,
			2,
		)}`,
	);
});
