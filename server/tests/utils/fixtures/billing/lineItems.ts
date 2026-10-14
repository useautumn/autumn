import { generateKsuid } from "@autumn/ksuid";
import type { LineItem } from "@autumn/shared";

const create = ({
	amount,
	direction,
	stripeProductId,
	discounts = [],
	amountAfterDiscounts,
	description = "Test line item",
	chargeImmediately = true,
}: {
	amount: number;
	direction?: "charge" | "refund";
	stripeProductId?: string;
	discounts?: LineItem["discounts"];
	amountAfterDiscounts?: number;
	description?: string;
	chargeImmediately?: boolean;
}): LineItem => ({
	id: generateKsuid({ prefix: "invoice_li_" }),
	amount,
	amountAfterDiscounts: amountAfterDiscounts ?? amount,
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
	prorated: false,
});

const charge = ({
	amount = 100,
	stripeProductId,
	discounts = [],
	amountAfterDiscounts,
}: {
	amount?: number;
	stripeProductId?: string;
	discounts?: LineItem["discounts"];
	amountAfterDiscounts?: number;
} = {}): LineItem =>
	create({
		amount: Math.abs(amount),
		direction: "charge",
		stripeProductId,
		discounts,
		amountAfterDiscounts,
	});

const refund = ({
	amount = 100,
	stripeProductId,
	discounts = [],
	amountAfterDiscounts,
}: {
	amount?: number;
	stripeProductId?: string;
	discounts?: LineItem["discounts"];
	amountAfterDiscounts?: number;
} = {}): LineItem =>
	create({
		amount: -Math.abs(amount),
		direction: "refund",
		stripeProductId,
		discounts,
		amountAfterDiscounts,
	});

const chargeForProduct = ({
	amount = 100,
	stripeProductId,
}: {
	amount?: number;
	stripeProductId: string;
}): LineItem => charge({ amount, stripeProductId });

const refundForProduct = ({
	amount = 100,
	stripeProductId,
}: {
	amount?: number;
	stripeProductId: string;
}): LineItem => refund({ amount, stripeProductId });

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
	const adjustedAmountAfterDiscounts =
		direction === "charge"
			? amount - existingDiscountAmount
			: amount + existingDiscountAmount;

	return create({
		amount,
		direction,
		stripeProductId,
		discounts: [existingDiscount],
		amountAfterDiscounts: adjustedAmountAfterDiscounts,
	});
};

export const lineItems = {
	create,

	charge,
	refund,

	chargeForProduct,
	refundForProduct,

	withExistingDiscount,
} as const;
