import type { AutumnBillingPlan } from "@autumn/shared";
import type { DeductionUpdate } from "../types/deductionUpdate";

/**
 * Mutates the deduction update in-place to reflect changes made by the
 * allocated invoice billing plan (inserted/deleted replaceables + balance adjustment).
 * This ensures `applyDeductionUpdateToFullCustomer` sees the correct state.
 */
export const refreshDeductionUpdate = ({
	update,
	plan,
}: {
	update: DeductionUpdate;
	plan: AutumnBillingPlan;
}) => {
	const cusEntUpdate = plan.updateCustomerEntitlements?.[0];
	if (!cusEntUpdate) return;

	const {
		balanceChange = 0,
		insertReplaceables,
		deletedReplaceables,
	} = cusEntUpdate;

	if (insertReplaceables && insertReplaceables.length > 0) {
		update.newReplaceables = insertReplaceables;
	}

	if (deletedReplaceables && deletedReplaceables.length > 0) {
		update.deletedReplaceables = deletedReplaceables.map((r) => ({
			...r,
			from_entity_id: r.from_entity_id ?? null,
		}));
	}

	if (balanceChange !== 0) {
		update.balance += balanceChange;
	}
};
