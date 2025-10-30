import type {
	EntityBalance,
	FullCustomerEntitlement,
} from "@models/cusProductModels/cusEntModels/cusEntModels.js";

export const formatCusEnt = ({
	cusEnt,
}: {
	cusEnt: FullCustomerEntitlement;
}) => {
	return `${cusEnt.entitlement.feature_id} (${cusEnt.entitlement.interval}) (${cusEnt.balance})`;
};

import type { FullCustomer } from "@autumn/shared";

export const updateCusEntInFullCus = ({
	fullCus,
	cusEntId,
	update,
}: {
	fullCus: FullCustomer;
	cusEntId: string;
	update: {
		balance: number;
		entities: Record<string, EntityBalance> | undefined;
		adjustment: number;
	};
}) => {
	for (let i = 0; i < fullCus.customer_products.length; i++) {
		for (
			let j = 0;
			j < fullCus.customer_products[i].customer_entitlements.length;
			j++
		) {
			const ce = fullCus.customer_products[i].customer_entitlements[j];
			if (ce.id === cusEntId) {
				fullCus.customer_products[i].customer_entitlements[j] = {
					...ce,
					balance: update.balance,
					entities: update.entities,
					adjustment: update.adjustment,
				};
			}
		}
	}
};
