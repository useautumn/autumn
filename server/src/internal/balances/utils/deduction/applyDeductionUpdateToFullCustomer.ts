import type { FullCustomer } from "@autumn/shared";
import type { DeductionUpdate } from "../types/deductionTypes.js";

export const applyDeductionUpdateToFullCustomer = ({
	fullCus,
	cusEntId,
	update,
}: {
	fullCus: FullCustomer;
	cusEntId: string;
	update: DeductionUpdate;
}) => {
	for (let i = 0; i < fullCus.customer_products.length; i++) {
		for (
			let j = 0;
			j < fullCus.customer_products[i].customer_entitlements.length;
			j++
		) {
			const ce = fullCus.customer_products[i].customer_entitlements[j];
			if (ce.id === cusEntId) {
				let replaceables = ce.replaceables ?? [];

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

				fullCus.customer_products[i].customer_entitlements[j] = {
					...ce,
					balance: update.balance,
					entities: update.entities,
					adjustment: update.adjustment,
					replaceables,
				};
			}
		}
	}
};
