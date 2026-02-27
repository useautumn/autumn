import { expect } from "bun:test";
import type { StripeInlinePrice } from "@autumn/shared";
import type Stripe from "stripe";
import type { NormalizedItem } from "../types";

/** Normalizes an actual Stripe subscription item into a comparable format. */
export const normalizeActualSubItem = ({
	item,
}: {
	item: Stripe.SubscriptionItem;
}): NormalizedItem => {
	const autumnCusPriceId = item.metadata?.autumn_customer_price_id;
	return {
		priceId: item.price.id,
		autumnCustomerPriceId: autumnCusPriceId || undefined,
		quantity: item.quantity ?? 0,
		isInline: !!autumnCusPriceId,
		unitAmountDecimal: autumnCusPriceId
			? (item.price.unit_amount_decimal ?? undefined)
			: undefined,
	};
};

/** Normalizes an actual Stripe schedule phase item into a comparable format. */
export const normalizeActualPhaseItem = ({
	item,
}: {
	item: Stripe.SubscriptionSchedule.Phase.Item;
}): NormalizedItem => {
	const priceId = typeof item.price === "string" ? item.price : item.price.id;
	const autumnCusPriceId = item.metadata?.autumn_customer_price_id;
	const priceObj =
		typeof item.price !== "string" && "unit_amount_decimal" in item.price
			? item.price
			: undefined;
	const unitAmountDecimal =
		autumnCusPriceId && priceObj
			? (priceObj.unit_amount_decimal ?? undefined)
			: undefined;
	return {
		priceId,
		autumnCustomerPriceId: autumnCusPriceId || undefined,
		quantity: item.quantity ?? 0,
		isInline: !!autumnCusPriceId,
		unitAmountDecimal,
	};
};

/** Normalizes an expected phase item (from buildStripePhasesUpdate) into a comparable format. */
export const normalizeExpectedPhaseItem = ({
	item,
}: {
	item: Stripe.SubscriptionScheduleUpdateParams.Phase.Item;
}): NormalizedItem => {
	const hasInlinePrice = "price_data" in item;
	const metadata = item.metadata as Record<string, string> | undefined;

	let unitAmountDecimal: string | undefined;
	if (hasInlinePrice) {
		const priceData = (item as { price_data: StripeInlinePrice }).price_data;
		unitAmountDecimal = priceData.unit_amount_decimal;
	}

	return {
		priceId: hasInlinePrice ? undefined : (item.price as string),
		autumnCustomerPriceId: metadata?.autumn_customer_price_id,
		quantity: (item.quantity as number) ?? 0,
		isInline: hasInlinePrice,
		unitAmountDecimal,
	};
};

/**
 * Compares expected items against actual items.
 * Stored items match by priceId. Inline items match by autumn_customer_price_id.
 */
export const compareItems = ({
	expectedItems,
	actualItems,
	label,
	debug,
}: {
	expectedItems: NormalizedItem[];
	actualItems: NormalizedItem[];
	label: string;
	debug?: boolean;
}) => {
	if (debug) {
		console.log(`\n[${label}] Expected items (${expectedItems.length}):`);
		for (const item of expectedItems) {
			console.log(
				`  ${item.isInline ? "inline" : "stored"} | price=${item.priceId ?? "N/A"} | cusPriceId=${item.autumnCustomerPriceId ?? "N/A"} | qty=${item.quantity} | amount=${item.unitAmountDecimal ?? "N/A"}`,
			);
		}
		console.log(`[${label}] Actual items (${actualItems.length}):`);
		for (const item of actualItems) {
			console.log(
				`  ${item.isInline ? "inline" : "stored"} | price=${item.priceId ?? "N/A"} | cusPriceId=${item.autumnCustomerPriceId ?? "N/A"} | qty=${item.quantity} | amount=${item.unitAmountDecimal ?? "N/A"}`,
			);
		}
	}

	for (const expected of expectedItems) {
		let actual: NormalizedItem | undefined;

		if (expected.isInline) {
			actual = actualItems.find(
				(a) => a.autumnCustomerPriceId === expected.autumnCustomerPriceId,
			);

			if (!actual) {
				console.error(
					`[${label}] Missing inline item with autumn_customer_price_id=${expected.autumnCustomerPriceId}`,
				);
				console.error(`  Expected:`, expected);
				console.error(`  Actual items:`, actualItems);
			}
		} else {
			actual = actualItems.find((a) => a.priceId === expected.priceId);

			if (!actual) {
				console.error(
					`[${label}] Missing stored item with priceId=${expected.priceId}`,
				);
				console.error(`  Expected:`, expected);
				console.error(`  Actual items:`, actualItems);
			}
		}

		expect(
			actual,
			`[${label}] No matching actual item for expected: ${JSON.stringify(expected)}`,
		).toBeDefined();

		if (actual && actual.quantity !== expected.quantity) {
			console.error(
				`[${label}] Quantity mismatch for ${expected.isInline ? `inline cusPriceId=${expected.autumnCustomerPriceId}` : `stored priceId=${expected.priceId}`}: expected=${expected.quantity}, actual=${actual.quantity}`,
			);
		}

		expect(actual?.quantity).toBe(expected.quantity);

		// Compare unit_amount_decimal for inline prices
		if (
			actual &&
			expected.unitAmountDecimal !== undefined &&
			actual.unitAmountDecimal !== undefined
		) {
			if (actual.unitAmountDecimal !== expected.unitAmountDecimal) {
				const itemLabel = expected.isInline
					? `inline cusPriceId=${expected.autumnCustomerPriceId}`
					: `stored priceId=${expected.priceId}`;
				console.error(
					`[${label}] Price amount mismatch for ${itemLabel}: expected=${expected.unitAmountDecimal}, actual=${actual.unitAmountDecimal}`,
				);
			}
			expect(
				actual.unitAmountDecimal,
				`[${label}] unit_amount_decimal mismatch for ${expected.isInline ? `inline cusPriceId=${expected.autumnCustomerPriceId}` : `stored priceId=${expected.priceId}`}`,
			).toBe(expected.unitAmountDecimal);
		}
	}

	if (actualItems.length !== expectedItems.length) {
		console.error(
			`[${label}] Item count mismatch: expected=${expectedItems.length}, actual=${actualItems.length}`,
		);
		console.error(`  Expected:`, expectedItems);
		console.error(`  Actual:`, actualItems);
	}

	expect(actualItems.length).toBe(expectedItems.length);
};
