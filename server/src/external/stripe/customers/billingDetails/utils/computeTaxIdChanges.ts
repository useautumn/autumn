import { type BillingDetailsParams, taxIdKey } from "@autumn/shared";
import type Stripe from "stripe";

type TaxIdChanges = NonNullable<BillingDetailsParams["tax_ids"]>;

/** Adds skip IDs the customer already has; removes skip IDs it doesn't. */
export const computeTaxIdChanges = ({
	currentTaxIds,
	taxIds,
}: {
	currentTaxIds: Stripe.TaxId[];
	taxIds: TaxIdChanges;
}) => {
	const currentKeys = new Set(currentTaxIds.map(taxIdKey));
	const removeKeys = new Set((taxIds.remove ?? []).map(taxIdKey));

	return {
		taxIdsToCreate: (taxIds.add ?? []).filter(
			(taxId) => !currentKeys.has(taxIdKey(taxId)),
		),
		taxIdsToDelete: currentTaxIds.filter((taxId) =>
			removeKeys.has(taxIdKey(taxId)),
		),
	};
};
