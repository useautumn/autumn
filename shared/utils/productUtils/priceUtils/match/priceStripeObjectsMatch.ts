import type { Price } from "@autumn/shared";

const stripeResourceFields = [
	"stripe_product_id",
	"stripe_price_id",
	"stripe_empty_price_id",
	"stripe_placeholder_price_id",
	"stripe_prepaid_price_v2_id",
	"stripe_meter_id",
	"stripe_event_name",
] as const;

export type PriceStripeObjectField = (typeof stripeResourceFields)[number];

const readField = (
	price: Price,
	field: PriceStripeObjectField,
): string | null => {
	const config = price.config as Partial<
		Record<PriceStripeObjectField, string | null>
	>;
	return config[field] ?? null;
};

export const priceStripeObjectsMatch = ({
	priceA,
	priceB,
}: {
	priceA: Price;
	priceB: Price;
}): boolean => {
	for (const field of stripeResourceFields) {
		if (readField(priceA, field) !== readField(priceB, field)) return false;
	}
	return true;
};

export const diffPriceStripeObjects = ({
	priceA,
	priceB,
}: {
	priceA: Price;
	priceB: Price;
}): {
	field: PriceStripeObjectField;
	a: string | null;
	b: string | null;
}[] => {
	const diffs: {
		field: PriceStripeObjectField;
		a: string | null;
		b: string | null;
	}[] = [];
	for (const field of stripeResourceFields) {
		const a = readField(priceA, field);
		const b = readField(priceB, field);
		if (a !== b) diffs.push({ field, a, b });
	}
	return diffs;
};
