import {
	addInterval,
	BillingInterval,
	ErrCode,
	type FullProduct,
	type Price,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

// Stripe flexible billing creates one line item per backdated billing period
// and does not support backdated invoices with more than 250 line items.
export const STRIPE_BACKDATE_INVOICE_LINE_ITEM_LIMIT = 250;

const countBackdatedPeriodsForPrice = ({
	price,
	startsAt,
	currentEpochMs,
}: {
	price: Price;
	startsAt: number;
	currentEpochMs: number;
}) => {
	const interval = price.config.interval;
	if (interval === BillingInterval.OneOff) return 0;

	let periods = 0;
	let periodStart = startsAt;

	while (periodStart < currentEpochMs) {
		periods += 1;
		if (periods > STRIPE_BACKDATE_INVOICE_LINE_ITEM_LIMIT) {
			return periods;
		}

		const nextPeriodStart = addInterval({
			from: periodStart,
			interval,
			intervalCount: price.config.interval_count ?? 1,
		});

		if (nextPeriodStart <= periodStart) {
			return Number.POSITIVE_INFINITY;
		}

		periodStart = nextPeriodStart;
	}

	return periods;
};

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
