import { type BillingDetailsParams, taxIdKey } from "@autumn/shared";
import type Stripe from "stripe";

type TaxIdChanges = NonNullable<BillingDetailsParams["tax_ids"]>;

/** Adds skip IDs the customer already has (or repeats); removes skip IDs it doesn't have. */
export const computeTaxIdChanges = ({
	currentTaxIds,
	taxIds,
}: {
	currentTaxIds: Stripe.TaxId[];
	taxIds: TaxIdChanges;
}) => {
	const currentKeys = new Set(currentTaxIds.map(taxIdKey));
	const removeKeys = new Set((taxIds.remove ?? []).map(taxIdKey));
	const uniqueAdds = new Map(
		(taxIds.add ?? []).map((taxId) => [taxIdKey(taxId), taxId]),
	);

	return {
		taxIdsToCreate: [...uniqueAdds]
			.filter(([key]) => !currentKeys.has(key))
			.map(([, taxId]) => taxId),
		taxIdsToDelete: currentTaxIds.filter((taxId) =>
			removeKeys.has(taxIdKey(taxId)),
		),
	};
};
