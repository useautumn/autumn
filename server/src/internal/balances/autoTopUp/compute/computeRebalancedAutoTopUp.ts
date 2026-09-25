import {
	type FullCusEntWithFullCusProduct,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	isCustomerEntitlementInOverage,
	sortCusEntsForPaydown,
} from "@autumn/shared";
import { runDeductionPass } from "@/internal/balances/track/deductUtils/deductFromCusEntsTypescript.js";
import type { DeductionUpdates } from "@/internal/balances/utils/types/deductionUpdate.js";
import type { MutationLogItem } from "@/internal/balances/utils/types/mutationLogItem.js";
import { validateInvoiceCreditBalanceMutation } from "@/internal/balances/utils/validateInvoiceCreditBalanceMutation.js";

export type AutoTopupRebalanceDelta = {
	cusEntId: string;
	featureId: string;
	delta: number;
};

/** The entity that owns the row, or null for a customer-level one. */
const ownerEntityOf = (customerEntitlement: FullCusEntWithFullCusProduct) =>
	customerEntitlement.internal_entity_id ??
	customerEntitlement.customer_product?.internal_entity_id ??
	null;

/**
 * Compute the list of balance deltas needed to rebalance an auto top-up:
 *   1. Pay down overage on non-prepaid, non-entity-scoped top-level cusEnts first
 *      (capped at 0 per cusEnt — the paydown primitive).
 *   2. Route the remainder to the prepaid one-off cusEnt.
 *
 * Deltas are applied at execute time via atomic SQL balance + delta increments, so
 * they're race-safe against concurrent deductions. Entity-scoped cusEnts are excluded
 * because there's no per-entity atomic primitive today (future work).
 */
export const computeRebalancedAutoTopUp = ({
	fullCustomer,
	featureId,
	quantity,
	prepaidCustomerEntitlementId,
}: {
	fullCustomer: FullCustomer;
	featureId: string;
	quantity: number;
	prepaidCustomerEntitlementId: string;
}): { deltas: AutoTopupRebalanceDelta[] } => {
	if (quantity <= 0) return { deltas: [] };

	const cusEntsForFeature = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId,
	});

	const prepaidCusEnt = cusEntsForFeature.find(
		(cusEnt) => cusEnt.id === prepaidCustomerEntitlementId,
	);

	if (!prepaidCusEnt) return { deltas: [] };

	validateInvoiceCreditBalanceMutation({ customerEntitlement: prepaidCusEnt });

	// Only the purchased row's own customer or entity is paid down, as the worker does.
	const prepaidOwner = ownerEntityOf(prepaidCusEnt);
	const candidates = sortCusEntsForPaydown({
		customerEntitlements: cusEntsForFeature.filter(
			(customerEntitlement) =>
				customerEntitlement.id !== prepaidCustomerEntitlementId &&
				ownerEntityOf(customerEntitlement) === prepaidOwner &&
				isCustomerEntitlementInOverage({ customerEntitlement }),
		),
	});

	const deltas: AutoTopupRebalanceDelta[] = [];
	let remainder = quantity;

	if (candidates.length > 0) {
		const updates: DeductionUpdates = {};
		const mutationLogs: MutationLogItem[] = [];

		const passResult = runDeductionPass({
			cusEnts: candidates,
			amountToDeduct: -quantity,
			maxBalance: 0,
			updates,
			mutationLogs,
		});

		remainder = Math.abs(passResult.amountToDeduct);

		for (const [cusEntId, update] of Object.entries(updates)) {
			const delta = -update.deducted;
			if (delta === 0) continue;
			deltas.push({ cusEntId, featureId, delta });
		}
	}

	if (remainder > 0) {
		deltas.push({ cusEntId: prepaidCusEnt.id, featureId, delta: remainder });
	}

	return { deltas };
};
