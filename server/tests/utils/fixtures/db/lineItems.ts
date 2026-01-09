import type { LineItem } from "@autumn/shared";

// ═══════════════════════════════════════════════════════════════════
// LINE ITEM FIXTURES
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a basic line item for testing
 * @param amount - The line item amount (positive for charge, negative for refund)
 * @param direction - "charge" or "refund" (default: inferred from amount sign)
 * @param stripeProductId - Optional Stripe product ID for applies_to matching
 * @param discounts - Existing discounts on this line item
 * @param finalAmount - Override finalAmount (default: same as amount)
 */
const create = ({
	amount,
	direction,
	stripeProductId,
	discounts = [],
	finalAmount,
	description = "Test line item",
	chargeImmediately = true,
}: {
	amount: number;
	direction?: "charge" | "refund";
	stripeProductId?: string;
	discounts?: LineItem["discounts"];
	finalAmount?: number;
	description?: string;
	chargeImmediately?: boolean;
}): LineItem => ({
	amount,
	finalAmount: finalAmount ?? amount,
	description,
	discounts,
	chargeImmediately,
	stripeProductId,
	context: {
		price: {} as LineItem["context"]["price"],
		product: {} as LineItem["context"]["product"],
		currency: "usd",
		direction: direction ?? (amount >= 0 ? "charge" : "refund"),
		now: Date.now(),
		billingTiming: "in_advance",
	},
});

/**
 * Create a charge line item
 * @param amount - Positive amount (default: 100)
 */
const charge = ({
	amount = 100,
	stripeProductId,
	discounts = [],
	finalAmount,
}: {
	amount?: number;
	stripeProductId?: string;
	discounts?: LineItem["discounts"];
	finalAmount?: number;
} = {}): LineItem =>
	create({
		amount: Math.abs(amount),
		direction: "charge",
		stripeProductId,
		discounts,
		finalAmount,
	});

/**
 * Create a refund line item
 * @param amount - Positive value that will be negated (default: 100)
 */
const refund = ({
	amount = 100,
	stripeProductId,
	discounts = [],
	finalAmount,
}: {
	amount?: number;
	stripeProductId?: string;
	discounts?: LineItem["discounts"];
	finalAmount?: number;
} = {}): LineItem =>
	create({
		amount: -Math.abs(amount),
		direction: "refund",
		stripeProductId,
		discounts,
		finalAmount,
	});

/**
 * Create a charge line item with a specific Stripe product ID
 */
const chargeForProduct = ({
	amount = 100,
	stripeProductId,
}: {
	amount?: number;
	stripeProductId: string;
}): LineItem => charge({ amount, stripeProductId });

/**
 * Create a refund line item with a specific Stripe product ID
 */
const refundForProduct = ({
	amount = 100,
	stripeProductId,
}: {
	amount?: number;
	stripeProductId: string;
}): LineItem => refund({ amount, stripeProductId });

/**
 * Create a line item with existing discounts applied
 */
const withExistingDiscount = ({
	amount,
	direction = "charge",
	existingDiscountAmount,
	stripeProductId,
}: {
	amount: number;
	direction?: "charge" | "refund";
	existingDiscountAmount: number;
	stripeProductId?: string;
}): LineItem => {
	const existingDiscount = { amountOff: existingDiscountAmount };
	const adjustedFinalAmount =
		direction === "charge"
			? amount - existingDiscountAmount
			: amount + existingDiscountAmount;

	return create({
		amount,
		direction,
		stripeProductId,
		discounts: [existingDiscount],
		finalAmount: adjustedFinalAmount,
	});
};

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════

export const lineItems = {
	// Generic builder
	create,

	// Direction-specific
	charge,
	refund,

	// With product ID
	chargeForProduct,
	refundForProduct,

	// With existing discounts
	withExistingDiscount,
} as const;
