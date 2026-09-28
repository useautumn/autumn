import type { BillingDetailsParams, BillingDetailsTaxId } from "@autumn/shared";
import type Stripe from "stripe";
import { computeTaxIdChanges } from "../utils/computeTaxIdChanges.js";
import { listStripeTaxIds } from "./listStripeTaxIds.js";

/**
 * Creates before deleting, so a rejected tax ID never leaves the customer with none.
 * Returns an undo so a later failed billing write leaves tax IDs as they were.
 */
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
	const created: Stripe.TaxId[] = [];
	const deleted: Stripe.TaxId[] = [];

	const createTaxId = ({ type, value }: BillingDetailsTaxId) =>
		stripeCli.customers.createTaxId(stripeCustomerId, {
			type: type as Stripe.TaxIdCreateParams.Type,
			value,
		});

	const undo = async () => {
		for (const taxId of created) {
			await stripeCli.customers.deleteTaxId(stripeCustomerId, taxId.id);
		}
		for (const taxId of deleted) await createTaxId(taxId);
	};

	try {
		for (const taxId of taxIdsToCreate) created.push(await createTaxId(taxId));
		for (const taxId of taxIdsToDelete) {
			await stripeCli.customers.deleteTaxId(stripeCustomerId, taxId.id);
			deleted.push(taxId);
		}
	} catch (error) {
		await undo();
		throw error;
	}

	return { undo };
};
