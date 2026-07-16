import {
	type FullPlanLicense,
	findPriceSuccessor,
	type LicenseBillingPriceRow,
} from "@autumn/shared";

/**
 * Read-time twin of the seat repoint executor: seat rows price through the
 * consuming side's pool definition, so refunds bill the outgoing terms and
 * charges/Stripe specs bill the incoming ones. Rows without a successor
 * (customized seats) flow through untouched.
 */
export const resolveLicenseBillingRowsThroughDefinition = ({
	licenseBillingRows,
	planLicense,
}: {
	licenseBillingRows: LicenseBillingPriceRow[];
	planLicense: FullPlanLicense;
}): LicenseBillingPriceRow[] =>
	licenseBillingRows.map((row) => {
		const successor = findPriceSuccessor({
			sourcePrice: row.price,
			candidatePrices: planLicense.product.prices,
		});
		if (!successor || successor.id === row.price.id) return row;
		return { ...row, price: successor };
	});
