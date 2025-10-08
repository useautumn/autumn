import type { FullCustomerEntitlement } from "@models/cusProductModels/cusEntModels/cusEntModels.js";

export const formatCusEnt = ({
	cusEnt,
}: {
	cusEnt: FullCustomerEntitlement;
}) => {
	return `${cusEnt.entitlement.feature_id} (${cusEnt.entitlement.interval}) (${cusEnt.balance})`;
};
