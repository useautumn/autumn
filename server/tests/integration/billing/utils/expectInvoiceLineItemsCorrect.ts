import { expect } from "bun:test";
import { type DbInvoiceLineItem, logInvoiceLineItems } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { invoiceLineItemRepo } from "@/internal/invoices/lineItems/repos";

const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Waits for invoice line items to be stored in the database.
 * Polls the database until line items are found or timeout is reached.
 */
export const waitForInvoiceLineItems = async ({
	stripeInvoiceId,
	timeoutMs = DEFAULT_TIMEOUT_MS,
	pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: {
	stripeInvoiceId: string;
	timeoutMs?: number;
	pollIntervalMs?: number;
}): Promise<DbInvoiceLineItem[]> => {
	const startTime = Date.now();

	while (Date.now() - startTime < timeoutMs) {
		const lineItems = await invoiceLineItemRepo.getByStripeInvoiceId({
			db: ctx.db,
			stripeInvoiceId,
		});

		if (lineItems.length > 0) {
			return lineItems;
		}

		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
	}

	throw new Error(
		`Timed out waiting for invoice line items for ${stripeInvoiceId} after ${timeoutMs}ms`,
	);
};

/**
 * Expected line item definition - flexible matching
 */
type ExpectedLineItem = {
	// Filter criteria
	isBasePrice?: boolean; // true = feature_id is null
	featureId?: string; // Match specific feature
	direction?: "charge" | "refund";
	billingTiming?: "in_advance" | "in_arrear";
	stripeId?: string; // Match specific Stripe line item ID
	stripeSubscriptionItemId?: string; // Match items in same group

	// Expectations
	amount?: number; // Exact amount (for single item match)
	totalAmount?: number; // Sum of all matching items
	count?: number; // Exact number of matching items
	minCount?: number; // At least this many
	prorated?: boolean;
	productId?: string;

	// Quantity expectations
	stripeQuantity?: number; // Single item's stripe_quantity
	totalQuantity?: number; // Sum of total_quantity across matching items
	paidQuantity?: number; // Sum of paid_quantity across matching items
};

type ExpectInvoiceLineItemsParams = {
	stripeInvoiceId: string;
	expectedTotal?: number;
	expectedCount?: number;
	expectedLineItems?: ExpectedLineItem[];
	allCharges?: boolean;
	allRefunds?: boolean;
	debug?: boolean;
};

/**
 * Builds a human-readable description of filter criteria for error messages
 */
const buildFilterDescription = (expected: ExpectedLineItem): string => {
	const parts: string[] = [];
	if (expected.isBasePrice) parts.push("base price");
	if (expected.featureId) parts.push(`feature=${expected.featureId}`);
	if (expected.direction) parts.push(expected.direction);
	if (expected.billingTiming) parts.push(expected.billingTiming);
	if (expected.stripeId) parts.push(`stripe_id=${expected.stripeId}`);
	if (expected.stripeSubscriptionItemId)
		parts.push(`group=${expected.stripeSubscriptionItemId}`);
	return parts.join(", ") || "all";
};

/**
 * Validates a single expected line item against the actual line items
 */
const validateExpectedLineItem = (
	lineItems: DbInvoiceLineItem[],
	expected: ExpectedLineItem,
): void => {
	const filterDesc = buildFilterDescription(expected);

	// Filter matching items
	const matching = lineItems.filter((li) => {
		if (expected.isBasePrice === true && li.feature_id !== null) return false;
		if (expected.isBasePrice === false && li.feature_id === null) return false;
		if (
			expected.featureId !== undefined &&
			li.feature_id !== expected.featureId
		)
			return false;
		if (expected.direction && li.direction !== expected.direction) return false;
		if (expected.billingTiming && li.billing_timing !== expected.billingTiming)
			return false;
		if (expected.stripeId && li.stripe_id !== expected.stripeId) return false;
		if (
			expected.stripeSubscriptionItemId &&
			li.stripe_subscription_item_id !== expected.stripeSubscriptionItemId
		)
			return false;
		return true;
	});

	// Count validations
	if (expected.count !== undefined) {
		expect(
			matching.length,
			`Expected ${expected.count} line items matching [${filterDesc}], found ${matching.length}`,
		).toBe(expected.count);
	}
	if (expected.minCount !== undefined) {
		expect(
			matching.length,
			`Expected at least ${expected.minCount} line items matching [${filterDesc}], found ${matching.length}`,
		).toBeGreaterThanOrEqual(expected.minCount);
	}

	// If no count specified, expect at least one
	if (expected.count === undefined && expected.minCount === undefined) {
		expect(
			matching.length,
			`Expected at least 1 line item matching [${filterDesc}], found none`,
		).toBeGreaterThanOrEqual(1);
	}

	// Amount validations
	if (expected.amount !== undefined) {
		if (matching.length !== 1) {
			throw new Error(
				`Cannot validate exact amount: expected 1 matching item for [${filterDesc}], found ${matching.length}`,
			);
		}
		expect(
			matching[0].amount,
			`Expected amount $${expected.amount} for [${filterDesc}], got $${matching[0].amount}`,
		).toBe(expected.amount);
	}
	if (expected.totalAmount !== undefined) {
		const actualTotal = matching.reduce((sum, li) => sum + li.amount, 0);
		expect(
			actualTotal,
			`Expected total amount $${expected.totalAmount} for [${filterDesc}], got $${actualTotal}`,
		).toBe(expected.totalAmount);
	}

	// Quantity validations (sum across group)
	if (expected.totalQuantity !== undefined) {
		const actualTotal = matching.reduce(
			(sum, li) => sum + (li.total_quantity ?? 0),
			0,
		);
		expect(
			actualTotal,
			`Expected total_quantity ${expected.totalQuantity} for [${filterDesc}], got ${actualTotal}`,
		).toBe(expected.totalQuantity);
	}
	if (expected.paidQuantity !== undefined) {
		const actualTotal = matching.reduce(
			(sum, li) => sum + (li.paid_quantity ?? 0),
			0,
		);
		expect(
			actualTotal,
			`Expected paid_quantity ${expected.paidQuantity} for [${filterDesc}], got ${actualTotal}`,
		).toBe(expected.paidQuantity);
	}
	if (expected.stripeQuantity !== undefined && matching.length === 1) {
		expect(
			matching[0].stripe_quantity,
			`Expected stripe_quantity ${expected.stripeQuantity} for [${filterDesc}], got ${matching[0].stripe_quantity}`,
		).toBe(expected.stripeQuantity);
	}

	// Other validations
	if (expected.prorated !== undefined) {
		for (const li of matching) {
			expect(
				li.prorated,
				`Expected prorated=${expected.prorated} for [${filterDesc}], got ${li.prorated}`,
			).toBe(expected.prorated);
		}
	}
	if (expected.productId !== undefined) {
		for (const li of matching) {
			expect(
				li.product_id,
				`Expected product_id=${expected.productId} for [${filterDesc}], got ${li.product_id}`,
			).toBe(expected.productId);
		}
	}
};

/**
 * Verifies invoice line items match expectations.
 * Always validates core fields (id prefix, stripe_invoice_id, amounts, product/price relationships).
 * Waits for line items to be stored (async workflow) before validating.
 *
 * @returns The fetched line items for additional custom assertions
 */
export const expectInvoiceLineItemsCorrect = async ({
	stripeInvoiceId,
	expectedTotal,
	expectedCount,
	expectedLineItems,
	allCharges,
	allRefunds,
	debug = true,
}: ExpectInvoiceLineItemsParams): Promise<DbInvoiceLineItem[]> => {
	// 1. Wait for line items to be stored (async workflow)
	const lineItems = await waitForInvoiceLineItems({ stripeInvoiceId });

	// 2. Debug logging FIRST (before any assertions)
	if (debug) {
		logInvoiceLineItems({ lineItems, stripeInvoiceId });
	}

	// 3. Basic existence check (should always pass after waitForInvoiceLineItems)
	expect(
		lineItems.length,
		`Expected invoice ${stripeInvoiceId} to have line items, but found none`,
	).toBeGreaterThan(0);

	// 4. Core field validations (always run)
	for (const li of lineItems) {
		expect(li.id, "Line item missing id").toBeDefined();
		expect(
			li.id.startsWith("invoice_li_"),
			`Line item id should start with "invoice_li_", got: ${li.id}`,
		).toBe(true);
		expect(li.stripe_invoice_id, "Line item missing stripe_invoice_id").toBe(
			stripeInvoiceId,
		);
		expect(
			typeof li.amount,
			`Line item amount should be number, got: ${typeof li.amount}`,
		).toBe("number");
		expect(
			typeof li.amount_after_discounts,
			"Line item amount_after_discounts should be number",
		).toBe("number");
		expect(li.currency, "Line item missing currency").toBeDefined();
		expect(
			li.product_id,
			`Line item ${li.id} missing product_id`,
		).toBeDefined();
		expect(li.price_id, `Line item ${li.id} missing price_id`).toBeDefined();
	}

	// 5. Count validation
	if (expectedCount !== undefined) {
		expect(
			lineItems.length,
			`Expected ${expectedCount} line items, got ${lineItems.length}`,
		).toBe(expectedCount);
	}

	// 6. Total validation
	if (expectedTotal !== undefined) {
		const actualTotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
		expect(
			actualTotal,
			`Expected total $${expectedTotal}, got $${actualTotal}`,
		).toBe(expectedTotal);
	}

	// 7. All charges/refunds validation
	if (allCharges) {
		for (const li of lineItems) {
			expect(
				li.direction,
				`Expected all charges, but line item ${li.id} (${li.feature_id ?? "base"}) has direction: ${li.direction}`,
			).toBe("charge");
		}
	}
	if (allRefunds) {
		for (const li of lineItems) {
			expect(
				li.direction,
				`Expected all refunds, but line item ${li.id} (${li.feature_id ?? "base"}) has direction: ${li.direction}`,
			).toBe("refund");
		}
	}

	// 8. Expected line items validation
	if (expectedLineItems) {
		for (const expected of expectedLineItems) {
			validateExpectedLineItem(lineItems, expected);
		}
	}

	return lineItems;
};

/**
 * Expects a base price line item exists with given criteria
 */
export const expectBasePriceLineItem = async ({
	stripeInvoiceId,
	amount,
	direction = "charge",
	prorated,
	productId,
	debug = true,
}: {
	stripeInvoiceId: string;
	amount?: number;
	direction?: "charge" | "refund";
	prorated?: boolean;
	productId?: string;
	debug?: boolean;
}): Promise<DbInvoiceLineItem> => {
	const lineItems = await expectInvoiceLineItemsCorrect({
		stripeInvoiceId,
		expectedLineItems: [
			{ isBasePrice: true, direction, amount, prorated, productId, count: 1 },
		],
		debug,
	});

	const basePrice = lineItems.find((li) => !li.feature_id);
	expect(basePrice, "Base price line item not found").toBeDefined();
	return basePrice!;
};

/**
 * Expects feature line items exist and returns them
 */
export const expectFeatureLineItems = async ({
	stripeInvoiceId,
	featureId,
	totalAmount,
	totalQuantity,
	direction,
	billingTiming,
	minCount = 1,
	debug = true,
}: {
	stripeInvoiceId: string;
	featureId: string;
	totalAmount?: number;
	totalQuantity?: number;
	direction?: "charge" | "refund";
	billingTiming?: "in_advance" | "in_arrear";
	minCount?: number;
	debug?: boolean;
}): Promise<DbInvoiceLineItem[]> => {
	const lineItems = await expectInvoiceLineItemsCorrect({
		stripeInvoiceId,
		expectedLineItems: [
			{
				featureId,
				direction,
				billingTiming,
				totalAmount,
				totalQuantity,
				minCount,
			},
		],
		debug,
	});

	return lineItems.filter((li) => li.feature_id === featureId);
};

/**
 * Expects a specific Stripe line item exists by stripe_id
 */
export const expectStripeLineItem = async ({
	stripeInvoiceId,
	stripeId,
	amount,
	stripeQuantity,
	totalQuantity,
	featureId,
	debug = true,
}: {
	stripeInvoiceId: string;
	stripeId: string;
	amount?: number;
	stripeQuantity?: number;
	totalQuantity?: number;
	featureId?: string | null;
	debug?: boolean;
}): Promise<DbInvoiceLineItem> => {
	const lineItems = await expectInvoiceLineItemsCorrect({
		stripeInvoiceId,
		expectedLineItems: [{ stripeId, amount, stripeQuantity, count: 1 }],
		debug,
	});

	const item = lineItems.find((li) => li.stripe_id === stripeId);
	expect(item, `Stripe line item ${stripeId} not found`).toBeDefined();

	if (featureId !== undefined) {
		expect(
			item!.feature_id,
			`Expected feature_id=${featureId} for stripe_id=${stripeId}, got ${item!.feature_id}`,
		).toBe(featureId);
	}
	if (totalQuantity !== undefined) {
		expect(
			item!.total_quantity,
			`Expected total_quantity=${totalQuantity} for stripe_id=${stripeId}, got ${item!.total_quantity}`,
		).toBe(totalQuantity);
	}

	return item!;
};
