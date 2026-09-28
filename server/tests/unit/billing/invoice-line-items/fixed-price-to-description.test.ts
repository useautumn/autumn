/**
 * Fixed price line descriptions when the line carries no period.
 *
 * Red (before):  invoices.create without a period rendered "Test Product - Base Price ()"
 * Green (after): the period suffix is omitted when there is no period
 */

import { expect, test } from "bun:test";
import type { LineItemContext } from "@autumn/shared";
import { fixedPriceToDescription } from "@shared/utils/billingUtils/invoicingUtils/descriptionUtils/fixedPriceToLineDescription";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { products } from "@tests/utils/fixtures/db/products.js";

const price = prices.createFixed({ id: "price_base" });

const contextWith = (
	overrides: Partial<LineItemContext> = {},
): LineItemContext => ({
	price,
	product: products.create(),
	currency: "usd",
	direction: "charge",
	now: Date.UTC(2026, 8, 1),
	billingTiming: "in_advance",
	...overrides,
});

test("fixed price description omits the period suffix when there is no period", () => {
	expect(fixedPriceToDescription({ price, context: contextWith() })).toBe(
		"Test Product - Base Price",
	);
	expect(
		fixedPriceToDescription({ price, context: contextWith(), quantity: 3 }),
	).toBe("Test Product - 3x Base Price");
});

test("fixed price description keeps the period suffix when a period is set", () => {
	const context = contextWith({
		effectivePeriod: {
			start: Date.UTC(2026, 8, 1),
			end: Date.UTC(2026, 8, 16),
		},
	});

	expect(fixedPriceToDescription({ price, context })).toMatch(
		/^Test Product - Base Price \(from .+ to .+\)$/,
	);
});
