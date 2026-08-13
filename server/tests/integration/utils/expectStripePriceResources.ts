/**
 * Shared Stripe resource assertions for plan / variant / license tests.
 *
 * Reuse levels match `PriceStripeReuseLevel` in shared:
 *   - full              — stripe_price_id + stripe_product_id (+ meter) carried
 *   - stripeProductOnly — stripe_product_id (+ meter) carried; price id NOT reused
 *   - none              — no stripe ids carried
 *
 * Every field is optional — omit to skip. Pass `null` to assert absent.
 */

import { expect } from "bun:test";
import {
	type FullProduct,
	findPriceByFeatureId,
	isFixedPrice,
	type Price,
	type PriceStripeReuseLevel,
} from "@autumn/shared";

export const STRIPE_RESOURCE_FIELDS = [
	"stripe_product_id",
	"stripe_price_id",
	"stripe_empty_price_id",
	"stripe_placeholder_price_id",
	"stripe_prepaid_price_v2_id",
	"stripe_meter_id",
	"stripe_event_name",
] as const;

export type StripeResourceField = (typeof STRIPE_RESOURCE_FIELDS)[number];

export const stripeConfigValue = ({
	price,
	field,
}: {
	price: Price | undefined;
	field: StripeResourceField;
}): string | null =>
	((price?.config as Record<string, string | null | undefined> | undefined)?.[
		field
	] ??
		null) ||
	null;

type ExpectedStripeIds = {
	/** Omit to skip. Pass null to assert absent. */
	stripeProductId?: string | null;
	stripePriceId?: string | null;
	stripeMeterId?: string | null;
	stripePrepaidPriceV2Id?: string | null;
	stripeEventName?: string | null;
};

/** Assert absolute stripe_* fields on a single price row. */
export const expectPriceStripeResourcesCorrect = ({
	price,
	stripeProductId,
	stripePriceId,
	stripeMeterId,
	stripePrepaidPriceV2Id,
	stripeEventName,
	label,
}: ExpectedStripeIds & {
	price: Price | undefined;
	label?: string;
}) => {
	const prefix = label ? `${label}: ` : "";
	expect(price, `${prefix}price row missing`).toBeDefined();
	if (!price) return;

	if (stripeProductId !== undefined) {
		expect(
			stripeConfigValue({ price, field: "stripe_product_id" }),
			`${prefix}stripe_product_id`,
		).toBe(stripeProductId);
	}
	if (stripePriceId !== undefined) {
		expect(
			stripeConfigValue({ price, field: "stripe_price_id" }),
			`${prefix}stripe_price_id`,
		).toBe(stripePriceId);
	}
	if (stripeMeterId !== undefined) {
		expect(
			stripeConfigValue({ price, field: "stripe_meter_id" }),
			`${prefix}stripe_meter_id`,
		).toBe(stripeMeterId);
	}
	if (stripePrepaidPriceV2Id !== undefined) {
		expect(
			stripeConfigValue({ price, field: "stripe_prepaid_price_v2_id" }),
			`${prefix}stripe_prepaid_price_v2_id`,
		).toBe(stripePrepaidPriceV2Id);
	}
	if (stripeEventName !== undefined) {
		expect(
			stripeConfigValue({ price, field: "stripe_event_name" }),
			`${prefix}stripe_event_name`,
		).toBe(stripeEventName);
	}
};

/** Assert a price has at least the core stripe ids (product + price). */
export const expectPriceStripeResourcesPresent = ({
	price,
	requireMeter = false,
	requirePrepaidV2 = false,
	label,
}: {
	price: Price | undefined;
	requireMeter?: boolean;
	requirePrepaidV2?: boolean;
	label?: string;
}) => {
	const prefix = label ? `${label}: ` : "";
	expect(price, `${prefix}price row missing`).toBeDefined();
	if (!price) return;

	expect(
		stripeConfigValue({ price, field: "stripe_price_id" }),
		`${prefix}stripe_price_id present`,
	).toBeTruthy();

	// Fixed base prices often only have stripe_price_id (no per-feature product).
	if (!isFixedPrice(price)) {
		expect(
			stripeConfigValue({ price, field: "stripe_product_id" }),
			`${prefix}stripe_product_id present`,
		).toBeTruthy();
	}

	if (requireMeter) {
		expect(
			stripeConfigValue({ price, field: "stripe_meter_id" }),
			`${prefix}stripe_meter_id present`,
		).toBeTruthy();
	}
	if (requirePrepaidV2) {
		expect(
			stripeConfigValue({ price, field: "stripe_prepaid_price_v2_id" }),
			`${prefix}stripe_prepaid_price_v2_id present`,
		).toBeTruthy();
	}
};

/** Assert a price has no stripe resource ids stamped. */
export const expectPriceStripeResourcesAbsent = ({
	price,
	label,
}: {
	price: Price | undefined;
	label?: string;
}) => {
	const prefix = label ? `${label}: ` : "";
	expect(price, `${prefix}price row missing`).toBeDefined();
	if (!price) return;

	for (const field of STRIPE_RESOURCE_FIELDS) {
		expect(
			stripeConfigValue({ price, field }),
			`${prefix}${field} absent`,
		).toBeNull();
	}
};

/**
 * Assert `after` carried stripe resources from `before` at the given reuse level.
 *
 * - full: product + price (+ meter if present on before) match
 * - stripeProductOnly: product (+ meter) match; price id must NOT match before
 * - none: product / price / meter must not match before's values
 */
export const expectPriceStripeReuseCorrect = ({
	before,
	after,
	reuse,
	label,
}: {
	before: Price;
	after: Price | undefined;
	reuse: PriceStripeReuseLevel;
	label?: string;
}) => {
	const prefix = label ? `${label}: ` : "";
	expect(after, `${prefix}after price missing`).toBeDefined();
	if (!after) return;

	const beforeProduct = stripeConfigValue({
		price: before,
		field: "stripe_product_id",
	});
	const beforePrice = stripeConfigValue({
		price: before,
		field: "stripe_price_id",
	});
	const beforeMeter = stripeConfigValue({
		price: before,
		field: "stripe_meter_id",
	});

	const afterProduct = stripeConfigValue({
		price: after,
		field: "stripe_product_id",
	});
	const afterPrice = stripeConfigValue({
		price: after,
		field: "stripe_price_id",
	});
	const afterMeter = stripeConfigValue({
		price: after,
		field: "stripe_meter_id",
	});

	if (reuse === "full") {
		if (beforeProduct) {
			expect(afterProduct, `${prefix}full: stripe_product_id`).toBe(
				beforeProduct,
			);
		}
		expect(afterPrice, `${prefix}full: stripe_price_id`).toBe(beforePrice);
		if (beforeMeter) {
			expect(afterMeter, `${prefix}full: stripe_meter_id`).toBe(beforeMeter);
		}
		return;
	}

	if (reuse === "stripeProductOnly") {
		if (beforeProduct) {
			expect(afterProduct, `${prefix}product-only: stripe_product_id`).toBe(
				beforeProduct,
			);
		}
		if (beforeMeter) {
			expect(afterMeter, `${prefix}product-only: stripe_meter_id`).toBe(
				beforeMeter,
			);
		}
		if (beforePrice) {
			expect(
				afterPrice,
				`${prefix}product-only: stripe_price_id must not reuse`,
			).not.toBe(beforePrice);
		}
		return;
	}

	// none
	if (beforeProduct) {
		expect(afterProduct, `${prefix}none: stripe_product_id`).not.toBe(
			beforeProduct,
		);
	}
	if (beforePrice) {
		expect(afterPrice, `${prefix}none: stripe_price_id`).not.toBe(beforePrice);
	}
	if (beforeMeter) {
		expect(afterMeter, `${prefix}none: stripe_meter_id`).not.toBe(beforeMeter);
	}
};

/** Assert product.processor Stripe id. */
export const expectProductProcessorCorrect = ({
	product,
	processorId,
	present,
}: {
	product: FullProduct;
	processorId?: string | null;
	present?: boolean;
}) => {
	if (present === true) {
		expect(product.processor?.id).toBeTruthy();
	}
	if (present === false) {
		expect(product.processor?.id ?? null).toBeNull();
	}
	if (processorId !== undefined) {
		expect(product.processor?.id ?? null).toBe(processorId);
	}
};

export const findFeaturePrice = ({
	product,
	featureId,
}: {
	product: FullProduct;
	featureId: string;
}): Price | undefined =>
	findPriceByFeatureId({ prices: product.prices, featureId });

export const findBasePrice = ({
	product,
}: {
	product: FullProduct;
}): Price | undefined => product.prices.find(isFixedPrice);
