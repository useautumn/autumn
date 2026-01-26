// 1. Get min next reset at cus ent

import type { Feature, FullCustomerEntitlement } from "@autumn/shared";

export const getMinNextResetAtCusEnt = ({
	cusEnts,
	feature,
}: {
	cusEnts: FullCustomerEntitlement[];
	feature: Feature;
}) => {
	return cusEnts
		.filter(
			(cusEnt) => cusEnt.entitlement.internal_feature_id == feature.internal_id,
		)
		.reduce((min, cusEnt) => {
			return Math.min(min, cusEnt.next_reset_at || Infinity);
		}, Infinity);
};
