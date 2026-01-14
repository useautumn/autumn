import type { FullCustomer } from "@autumn/shared";
import type { DeductionUpdate } from "../types/deductionUpdate.js";

export const applyDeductionUpdateToFullCustomer = ({
	fullCus,
	cusEntId,
	update,
}: {
	fullCus: FullCustomer;
	cusEntId: string;
	update: DeductionUpdate;
}) => {
	// Search in customer_products first
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
				return; // Found and updated, exit early
			}
		}
	}

	// Search in extra_customer_entitlements (loose entitlements)
	const extraCusEnts = fullCus.extra_customer_entitlements || [];
	for (let i = 0; i < extraCusEnts.length; i++) {
		const ce = extraCusEnts[i];
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

			fullCus.extra_customer_entitlements[i] = {
				...ce,
				balance: update.balance,
				entities: update.entities,
				adjustment: update.adjustment,
				replaceables,
			};
			return; // Found and updated, exit early
		}
	}
};
