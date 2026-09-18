import { ErrCode, RecaseError, stripeToAtmnAmount } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { stripePriceToAmount } from "@/external/stripe/prices/utils/convertStripePriceUtils";
import type { NamedStripePrices } from "../setup/fetchNamedStripePrices";

export type NamedStripePriceLine = { amount: number; stripeQuantity: number };

/**
 * What a named Stripe price bills for these units. The amount comes from the
 * Stripe price itself so the preview cannot disagree with the invoice, which
 * also means proration cannot apply to the line.
 */
export const namedStripePriceLineAmount = ({
	namedStripePrices,
	stripePriceId,
	quantity,
	billingUnits,
	currency,
	prorateRequested,
}: {
	namedStripePrices: NamedStripePrices;
	stripePriceId: string;
	quantity: number | null;
	billingUnits?: number | null;
	currency: string;
	prorateRequested?: boolean;
}): NamedStripePriceLine => {
	if (prorateRequested) {
		throw new RecaseError({
			message: `Line billed under Stripe price ${stripePriceId} cannot be prorated: Stripe charges that price as configured`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const stripePrice = namedStripePrices.get(stripePriceId);
	if (!stripePrice) {
		throw new RecaseError({
			message: `Stripe price ${stripePriceId} not found`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const stripeQuantity =
		quantity === null
			? 1
			: new Decimal(quantity)
					.div(billingUnits ?? 1)
					.ceil()
					.toNumber();

	const minorAmount = stripePriceToAmount({
		stripePrice,
		quantity: stripeQuantity,
	});
	if (minorAmount === null) {
		throw new RecaseError({
			message: `Stripe price ${stripePriceId} is tiered but its tiers could not be read`,
			code: ErrCode.InternalError,
			statusCode: 500,
		});
	}

	return {
		amount: stripeToAtmnAmount({ amount: minorAmount, currency }),
		stripeQuantity,
	};
};
