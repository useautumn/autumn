import { ErrCode, type FullProduct, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import {
	countBackdatedPeriodsForPrice,
	STRIPE_BACKDATE_INVOICE_LINE_ITEM_LIMIT,
} from "./countBackdatedPeriods";

export const countStripeBackdateInvoiceLineItems = ({
	products,
	startsAt,
	currentEpochMs,
}: {
	products: FullProduct[];
	startsAt: number;
	currentEpochMs: number;
}) => {
	if (startsAt >= currentEpochMs) return 0;

	return products.reduce((count, product) => {
		return (
			count +
			product.prices.reduce((priceCount, price) => {
				return (
					priceCount +
					countBackdatedPeriodsForPrice({
						price,
						startsAt,
						currentEpochMs,
					})
				);
			}, 0)
		);
	}, 0);
};

export const assertStripeBackdateInvoiceLineItemLimit = ({
	products,
	startsAt,
	currentEpochMs,
	subject = "Past starts_at",
}: {
	products: FullProduct[];
	startsAt: number;
	currentEpochMs: number;
	subject?: string;
}) => {
	const lineItemCount = countStripeBackdateInvoiceLineItems({
		products,
		startsAt,
		currentEpochMs,
	});

	if (lineItemCount <= STRIPE_BACKDATE_INVOICE_LINE_ITEM_LIMIT) return;

	throw new RecaseError({
		message: `${subject} is too far in the past. Stripe supports backdating only when the first invoice has at most ${STRIPE_BACKDATE_INVOICE_LINE_ITEM_LIMIT} line items.`,
		code: ErrCode.InvalidRequest,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};
