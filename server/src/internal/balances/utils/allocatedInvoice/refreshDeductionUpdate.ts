import type { AutumnBillingPlan } from "@autumn/shared";
import type { DeductionUpdate } from "../types/deductionUpdate";

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
