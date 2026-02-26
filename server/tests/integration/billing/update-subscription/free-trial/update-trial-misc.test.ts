import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	FreeTrialDuration,
	freeTrials,
	ms,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { invoiceLineItemRepo } from "@/internal/invoices/lineItems/repos";
import { ProductService } from "@/internal/products/ProductService.js";

/**
 * Miscellaneous trial update tests
 *
 * Tests for edge cases and specific behaviors around trial updates.
 */

// Test that passing free_trial param does NOT create a new free trial record for the original product
test.concurrent(`${chalk.yellowBright("trial-misc: update subscription free_trial param does not override product default trial")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });

	// Create a product with a default 7-day trial
	const proFreeTrial = products.proWithTrial({
		items: [messagesItem],
		id: "pro-free-trial",
		trialDays: 7,
	});

	const { customerId, autumnV1, ctx, advancedTo } = await initScenario({
		customerId: "trial-misc-no-override",
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proFreeTrial] }),
		],
		actions: [s.attach({ productId: proFreeTrial.id })],
	});

	// Verify product is trialing with 7-day trial
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerBefore,
		productId: proFreeTrial.id,
		trialEndsAt: advancedTo + ms.days(7),
	});

	// Get the full product to access internal_id
	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: proFreeTrial.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	// Verify initial free trial count for this product
	const initialFreeTrials = await ctx.db.query.freeTrials.findMany({
		where: eq(freeTrials.internal_product_id, fullProduct.internal_id),
	});
	expect(initialFreeTrials.length).toBe(1);
	expect(initialFreeTrials[0].is_custom).toBe(false);

	// Update subscription with a DIFFERENT free_trial param (14 days)
	// This should NOT create a new free trial record for the original product
	const updateParams = {
		customer_id: customerId,
		product_id: proFreeTrial.id,
		free_trial: {
			length: 14,
			duration: FreeTrialDuration.Day,
			card_required: true,
			unique_fingerprint: false,
		},
	};

	await autumnV1.subscriptions.update(updateParams);

	// Verify customer is now trialing with 14-day trial
	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductTrialing({
		customer: customerAfter,
		productId: proFreeTrial.id,
		trialEndsAt: advancedTo + ms.days(14),
	});

	// Query DB to verify only 1 free trial exists for the original product's internal_id
	// The custom free_trial param should NOT be persisted against the product's internal_id
	const finalFreeTrials = await ctx.db.query.freeTrials.findMany({
		where: eq(freeTrials.internal_product_id, fullProduct.internal_id),
	});

	// Should still be only 1 free trial (the original product's default trial)
	// The custom 14-day trial should not create a new record linked to this product
	const nonCustomFreeTrials = finalFreeTrials.filter(
		(ft) => ft.is_custom === false,
	);
	expect(nonCustomFreeTrials.length).toBe(1);
	expect(nonCustomFreeTrials[0].length).toBe(7); // Original 7-day trial unchanged

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Remove trial on multi-entity product - verify line items persisted
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Create Pro with trial ($20/mo per entity, 14-day trial) with all feature types
 * - Create 2 entities, attach Pro trial to EACH entity
 * - Remove trial on one entity by calling subscriptions.update({ free_trial: null })
 *
 * Expected Result:
 * - Removing trial generates an invoice
 * - Invoice line items are persisted to DB
 * - Line items include base price charge, prepaid charges, allocated charges
 * - prorated: false (trial removal = start fresh billing)
 */
test.concurrent(`${chalk.yellowBright("trial-misc: remove trial multi-entity with all feature types - line items persisted")}`, async () => {
	const customerId = "trial-misc-remove-multi-entity-line-items";

	// Pro product with trial and all feature types
	const freeMessages = items.monthlyMessages({ includedUsage: 100 });
	const prepaidMessages = items.prepaidMessages({
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const consumableWords = items.consumableWords({ includedUsage: 50 });
	const allocatedUsers = items.allocatedUsers({ includedUsage: 2 });

	const proTrial = products.proWithTrial({
		id: "pro-trial-multi-entity",
		items: [freeMessages, prepaidMessages, consumableWords, allocatedUsers],
		trialDays: 14,
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach pro trial to both entities with prepaid quantity
			s.billing.attach({
				productId: proTrial.id,
				entityIndex: 0,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
			s.billing.attach({
				productId: proTrial.id,
				entityIndex: 1,
				options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
			}),
		],
	});

	// Verify both entities are trialing (should have $0 invoices for trials)
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	// Trial invoices are $0
	await expectCustomerInvoiceCorrect({
		customer: customerBefore,
		count: 2, // 2 trial invoices
	});

	// Remove trial on entity 1 - this should generate a paid invoice
	// Base ($20) + Prepaid ($10) = $30
	const result = await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[0].id,
		product_id: proTrial.id,
		free_trial: null, // Remove trial
	});

	// Verify invoice was created for entity 1's charges
	expect(result.invoice).toBeDefined();
	expect(result.invoice!.stripe_id).toBeDefined();

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Should now have 3 invoices: 2 trial ($0) + 1 paid invoice
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 3,
	});

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify invoice line items are persisted to DB
	// ═══════════════════════════════════════════════════════════════════════════════

	const lineItems = await invoiceLineItemRepo.getByStripeInvoiceId({
		db: ctx.db,
		stripeInvoiceId: result.invoice!.stripe_id,
	});

	// Should have line items for base price + prepaid
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

		// Direction field - all should be charges for trial removal
		expect(lineItem.direction).toBe("charge");

		// Product relationship
		expect(lineItem.product_id).toBeDefined();
		expect(lineItem.price_id).toBeDefined();

		// Trial removal = not prorated (starts fresh billing cycle)
		expect(lineItem.prorated).toBe(false);
	}

	// Verify base price line item exists ($20)
	const basePriceItems = lineItems.filter(
		(li) => !li.feature_id && li.amount === 20,
	);
	expect(basePriceItems.length).toBe(1);

	// Verify prepaid messages line item exists ($10)
	const prepaidItems = lineItems.filter(
		(li) =>
			li.feature_id === TestFeature.Messages &&
			li.billing_timing === "in_advance",
	);
	expect(prepaidItems.length).toBeGreaterThan(0);

	// Calculate prepaid total (should be $10 for 1 pack)
	const prepaidTotal = prepaidItems.reduce((sum, li) => sum + li.amount, 0);
	expect(prepaidTotal).toBe(10);

	// Verify total matches expected: base ($20) + prepaid ($10) = $30
	const lineItemsTotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
	expect(lineItemsTotal).toBe(30);

	// Log for debugging
	console.log(`Line items count: ${lineItems.length}`);
	console.log(
		`Line items: ${JSON.stringify(
			lineItems.map((li) => ({
				id: li.id,
				feature_id: li.feature_id,
				amount: li.amount,
				description: li.description,
				prorated: li.prorated,
			})),
			null,
			2,
		)}`,
	);
});
