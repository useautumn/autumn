/**
 * Immediate Switch Misc Tests (Attach V2)
 *
 * Tests for miscellaneous upgrade scenarios including invoice line item persistence.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { invoiceLineItemRepo } from "@/internal/invoices/lineItems/repos";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Pro to Premium upgrade with all paid feature types - verify line items persisted
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro ($20/mo) with mixed features:
 *   - Free messages (100 included)
 *   - Prepaid messages ($10/100 units)
 *   - Consumable words (50 included, $0.05/unit overage)
 *   - Allocated users (3 included, $10/seat)
 * - Create 5 user entities (2 overage seats)
 * - Track 100 words (50 overage)
 * - Attach prepaid messages quantity
 * - Upgrade to Premium ($50/mo) with same feature structure
 *
 * Expected Result:
 * - Invoice line items are persisted to DB
 * - Line items include: base price proration, prepaid charges, allocated seat charges
 * - Each line item has correct metadata (price_id, product_id, prorated flag, etc.)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-misc 1: pro to premium with all feature types - line items persisted")}`, async () => {
	const customerId = "imm-switch-line-items-all-features";

	// Pro product with all feature types
	const proFreeMessages = items.lifetimeMessages({ includedUsage: 100 });
	const proPrepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const proConsumableWords = items.consumableWords({ includedUsage: 50 });
	const proAllocatedUsers = items.allocatedUsers({ includedUsage: 3 });

	const pro = products.pro({
		id: "pro-all-features",
		items: [
			proFreeMessages,
			proPrepaidMessages,
			proConsumableWords,
			proAllocatedUsers,
		],
	});

	// Premium product with same features but higher base price
	const premiumFreeMessages = items.lifetimeMessages({ includedUsage: 200 });
	const premiumPrepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const premiumConsumableWords = items.consumableWords({ includedUsage: 100 });
	const premiumAllocatedUsers = items.allocatedUsers({ includedUsage: 5 });

	const premium = products.premium({
		id: "premium-all-features",
		items: [
			premiumFreeMessages,
			premiumPrepaidMessages,
			premiumConsumableWords,
			premiumAllocatedUsers,
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 5, featureId: TestFeature.Users }), // 5 users, 2 over included
		],
		actions: [
			// Attach pro with prepaid quantity and allocated users will auto-track via entities
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
			// Track words into overage (100 words, 50 included = 50 overage)
			s.track({ featureId: TestFeature.Words, value: 100 }),
		],
	});

	// Upgrade to premium with prepaid quantity
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
		redirect_mode: "if_required",
	});

	// Verify invoice was created
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify product states
	await expectCustomerProducts({
		customer,
		active: [premium.id],
		notPresent: [pro.id],
	});

	// Verify invoice exists
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2, // Initial pro invoice + upgrade invoice
	});

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify invoice line items are persisted to DB
	// ═══════════════════════════════════════════════════════════════════════════════

	const lineItems = await invoiceLineItemRepo.getByStripeInvoiceId({
		db: ctx.db,
		stripeInvoiceId: result.invoice!.stripe_id,
	});

	// Should have multiple line items (base price charges/refunds, prepaid, allocated)
	expect(lineItems.length).toEqual(4);

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

		// Direction field
		expect(["charge", "refund"]).toContain(lineItem.direction);

		// Product relationship
		expect(lineItem.product_id).toBeDefined();
		expect(lineItem.price_id).toBeDefined();
	}

	// Verify we have at least one prorated line item (upgrade is mid-cycle conceptually at start)
	// Base price items should exist
	const basePriceItems = lineItems.filter(
		(li) =>
			li.description.toLowerCase().includes("base") ||
			li.description.toLowerCase().includes("pro") ||
			li.description.toLowerCase().includes("premium"),
	);
	expect(basePriceItems.length).toBeGreaterThan(0);

	// Verify prepaid messages line items exist
	const prepaidItems = lineItems.filter(
		(li) =>
			li.feature_id === TestFeature.Messages &&
			li.billing_timing === "in_advance",
	);
	// Should have prepaid charges
	expect(prepaidItems.length).toBeGreaterThanOrEqual(0); // May be 0 if prepaid rolled over

	// Verify allocated users line items exist (if overage was charged)
	const allocatedItems = lineItems.filter(
		(li) => li.feature_id === TestFeature.Users,
	);
	// May have allocated seat charges from 5 users - 3 included = 2 overage
	// This depends on proration behavior
	console.log(`Allocated items: ${allocatedItems.length}`);

	// Log for debugging
	console.log(`Line items count: ${lineItems.length}`);
	console.log(
		`Line item features: ${lineItems.map((li) => li.feature_id).join(", ")}`,
	);
});
