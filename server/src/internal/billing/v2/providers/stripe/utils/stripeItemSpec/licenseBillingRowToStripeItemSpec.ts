import {
	type FixedPriceConfig,
	InternalError,
	type LicenseBillingPriceRow,
	type StripeItemSpec,
} from "@autumn/shared";

/** Converts a license billing row (seat snapshot or buffer) to a StripeItemSpec. */
export const licenseBillingRowToStripeItemSpec = ({
	licenseBillingRow,
}: {
	licenseBillingRow: LicenseBillingPriceRow;
}): StripeItemSpec => {
	const config = licenseBillingRow.price.config as FixedPriceConfig;

	if (!config.stripe_price_id) {
		throw new InternalError({
			message: `[licenseBillingRowToStripeItemSpec] Price ${licenseBillingRow.price.id} has no config.stripe_price_id`,
		});
	}

	return {
		stripePriceId: config.stripe_price_id,
		quantity: licenseBillingRow.quantity,
		autumnPrice: licenseBillingRow.price,
	};
};
