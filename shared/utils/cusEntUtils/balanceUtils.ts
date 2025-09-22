import { FullCustomerEntitlement } from "../../models/cusProductModels/cusEntModels/cusEntModels.js";
import { notNullish, nullish } from "../utils.js";

export const getSummedEntityBalances = ({
	cusEnt,
}: {
	cusEnt: FullCustomerEntitlement;
}) => {
	if (nullish(cusEnt.entities)) {
		return {
			balance: 0,
			adjustment: 0,
			unused: 0,
			count: 0,
		};
	}

	return {
		balance: Object.values(cusEnt.entities!).reduce(
			(acc, curr) => acc + curr.balance,
			0,
		),
		adjustment: Object.values(cusEnt.entities!).reduce(
			(acc, curr) => acc + curr.adjustment,
			0,
		),
		unused: 0,
		count: Object.values(cusEnt.entities!).length,
	};
};

export const getCusEntBalance = ({
	cusEnt,
	entityId,
}: {
	cusEnt: FullCustomerEntitlement;
	entityId?: string | null;
}) => {
	let entitlement = cusEnt.entitlement;
	let ent = cusEnt.entitlement;
	let feature = ent.feature;

	if (notNullish(entitlement.entity_feature_id)) {
		if (nullish(entityId)) {
			return getSummedEntityBalances({
				cusEnt,
			});
		} else {
			let entityBalance = cusEnt.entities?.[entityId!]?.balance;
			let adjustment = cusEnt.entities?.[entityId!]?.adjustment || 0;

			if (nullish(entityBalance)) {
				return { balance: 0, adjustment: 0, unused: 0, count: 1 };
			}

			return {
				balance: entityBalance || 0,
				adjustment,
				unused: 0,
				count: 1,
			};
		}
	}

	return {
		balance: cusEnt.balance,
		adjustment: cusEnt.adjustment,
		unused: cusEnt.replaceables?.length || 0,
		count: 1,
	};
};
