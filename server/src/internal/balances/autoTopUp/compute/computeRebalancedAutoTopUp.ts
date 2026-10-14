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

const ownerEntityOf = (customerEntitlement: FullCusEntWithFullCusProduct) =>
	customerEntitlement.internal_entity_id ??
	customerEntitlement.customer_product?.internal_entity_id ??
	null;

export const computeRebalancedAutoTopUp = ({
	fullCustomer,
	featureId,
	quantity,
	prepaidCustomerEntitlementId,
	allowInvoiceCreditBalance = false,
}: {
	fullCustomer: FullCustomer;
	featureId: string;
	quantity: number;
	prepaidCustomerEntitlementId: string;
	allowInvoiceCreditBalance?: boolean;
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

	if (!allowInvoiceCreditBalance) {
		validateInvoiceCreditBalanceMutation({
			customerEntitlement: prepaidCusEnt,
		});
	}

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
