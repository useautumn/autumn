import type { EntityBalance, FullCustomerEntitlement } from "@autumn/shared";
import { notNullish } from "@/utils/genUtils.js";

export type ResetBalancesUpdate =
	| { entities: Record<string, EntityBalance> }
	| { balance: number; additional_balance: number; adjustment: number };

export const getResetBalancesUpdate = ({
	cusEnt,
	allowance,
}: {
	cusEnt: FullCustomerEntitlement;
	allowance?: number;
}): ResetBalancesUpdate => {
	const newBalance = notNullish(allowance)
		? allowance!
		: cusEnt.entitlement.allowance || 0;

	const entitlement = cusEnt.entitlement;

	if (notNullish(entitlement.entity_feature_id)) {
		const newEntities = { ...cusEnt.entities };
		for (const entityId in newEntities) {
			newEntities[entityId].balance = newBalance;
			newEntities[entityId].adjustment = 0;
		}
		return { entities: newEntities };
	}

	return {
		balance: newBalance,
		additional_balance: 0,
		adjustment: 0,
	};
};
