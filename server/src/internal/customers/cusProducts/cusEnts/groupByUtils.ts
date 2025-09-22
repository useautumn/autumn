import { FullCustomerEntitlement } from "@autumn/shared";
import { notNullish } from "@/utils/genUtils.js";

export const getResetBalancesUpdate = ({
	cusEnt,
	allowance,
}: {
	cusEnt: FullCustomerEntitlement;
	allowance?: number;
}) => {
	let update = {};
	let newBalance = notNullish(allowance)
		? allowance!
		: cusEnt.entitlement.allowance || 0;

	let entitlement = cusEnt.entitlement;

	if (notNullish(entitlement.entity_feature_id)) {
		let newEntities = { ...cusEnt.entities };
		for (const entityId in newEntities) {
			newEntities[entityId].balance = newBalance;
			newEntities[entityId].adjustment = 0;
		}
		update = { entities: newEntities };
	} else {
		update = { balance: newBalance };
	}

	return update;
};
