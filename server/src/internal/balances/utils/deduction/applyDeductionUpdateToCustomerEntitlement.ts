import type { FullCusEntWithFullCusProduct } from "@autumn/shared";
import type { DeductionUpdate } from "../types/deductionUpdate.js";

export const applyDeductionUpdateToCustomerEntitlement = ({
	customerEntitlement,
	update,
}: {
	customerEntitlement: FullCusEntWithFullCusProduct;
	update: DeductionUpdate;
}) => {
	let replaceables = customerEntitlement.replaceables ?? [];

	if (update.newReplaceables) {
		replaceables = [
			...replaceables,
			...update.newReplaceables.map((r) => ({
				...r,
				delete_next_cycle: r.delete_next_cycle ?? true,
				from_entity_id: r.from_entity_id ?? null,
			})),
		];
	}

	if (update.deletedReplaceables) {
		replaceables = replaceables.filter(
			(r) => !update.deletedReplaceables?.map((r) => r.id).includes(r.id),
		);
	}

	return {
		...customerEntitlement,
		balance: update.balance,
		entities: update.entities,
		adjustment: update.adjustment,
		replaceables,
	};
};
