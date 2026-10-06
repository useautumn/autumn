import {
	atmnToStripeAmount,
	type PreviewLineItem,
	stripeToAtmnAmount,
} from "@autumn/shared";

const roundToMinorUnit = ({
	amount,
	currency,
}: {
	amount: number;
	currency: string;
}) =>
	stripeToAtmnAmount({
		amount: atmnToStripeAmount({ amount, currency }),
		currency,
	});

/** Stripe invoices each line in whole minor units, so a preview line shows the amount it will bill. */
export const roundPreviewLineItem = ({
	lineItem,
	currency,
}: {
	lineItem: PreviewLineItem;
	currency: string;
}): PreviewLineItem => ({
	...lineItem,
	subtotal: roundToMinorUnit({ amount: lineItem.subtotal, currency }),
	total: roundToMinorUnit({ amount: lineItem.total, currency }),
	discounts: lineItem.discounts.map((discount) => ({
		...discount,
		amount_off: roundToMinorUnit({ amount: discount.amount_off, currency }),
	})),
});
