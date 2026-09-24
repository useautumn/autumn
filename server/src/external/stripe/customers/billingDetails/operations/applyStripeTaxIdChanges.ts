import type { BillingDetailsParams } from "@autumn/shared";
import type Stripe from "stripe";
import { computeTaxIdChanges } from "../utils/computeTaxIdChanges.js";
import { listStripeTaxIds } from "./listStripeTaxIds.js";

/** Creates before deleting so a rejected tax ID never leaves the customer with none. */
export const applyStripeTaxIdChanges = async ({
	stripeCli,
	stripeCustomerId,
	taxIds,
}: {
	stripeCli: Stripe;
	stripeCustomerId: string;
	taxIds: NonNullable<BillingDetailsParams["tax_ids"]>;
}) => {
	const { taxIdsToCreate, taxIdsToDelete } = computeTaxIdChanges({
		currentTaxIds: await listStripeTaxIds({ stripeCli, stripeCustomerId }),
		taxIds,
	});

	for (const { type, value } of taxIdsToCreate) {
		await stripeCli.customers.createTaxId(stripeCustomerId, {
			type: type as Stripe.TaxIdCreateParams.Type,
			value,
		});
	}

	for (const taxId of taxIdsToDelete) {
		await stripeCli.customers.deleteTaxId(stripeCustomerId, taxId.id);
	}
};
