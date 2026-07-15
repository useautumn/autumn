import type {
	CustomerLicenseTransition,
	LicenseBillingPriceRow,
} from "@autumn/shared";

/** The outgoing pool's seat rows re-attributed to the planted successor:
 * prices repoint per priceTransitions, unmatched (customized) rows flow
 * through untouched — mirroring the executor's bulk repoint. */
export const transitionLicenseBillingPriceRows = ({
	licenseBillingPriceRows,
	customerLicenseTransition,
}: {
	licenseBillingPriceRows: LicenseBillingPriceRow[];
	customerLicenseTransition: CustomerLicenseTransition;
}): LicenseBillingPriceRow[] => {
	const { outgoingCustomerLicense, incomingCustomerLicense, priceTransitions } =
		customerLicenseTransition;

	const outgoingSeatRows = licenseBillingPriceRows.filter(
		(row) => row.source.customerLicenseId === outgoingCustomerLicense.id,
	);
	if (outgoingSeatRows.length === 0) return [];

	const toPriceIdByFromPriceId = new Map(
		priceTransitions.map((priceTransition) => [
			priceTransition.fromPriceId,
			priceTransition.toPriceId,
		]),
	);
	const incomingPriceById = new Map(
		(incomingCustomerLicense.planLicense?.product.prices ?? []).map((price) => [
			price.id,
			price,
		]),
	);

	return outgoingSeatRows.map((row) => {
		const toPriceId = toPriceIdByFromPriceId.get(row.price.id);
		const toPrice = toPriceId ? incomingPriceById.get(toPriceId) : undefined;
		return {
			customerProductId: incomingCustomerLicense.parent_customer_product_id,
			price: toPrice ?? row.price,
			quantity: row.quantity,
			source: {
				type: row.source.type,
				customerLicenseId: incomingCustomerLicense.id,
			},
		};
	});
};
