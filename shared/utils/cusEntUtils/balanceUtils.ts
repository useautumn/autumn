import { AllowanceType } from "@models/productModels/entModels/entModels.js";
import { Decimal } from "decimal.js";
import type { FullCustomerEntitlement } from "../../models/cusProductModels/cusEntModels/cusEntModels.js";
import type { FullCusEntWithFullCusProduct } from "../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import { notNullish, nullish } from "../utils.js";

export const getSummedEntityBalances = ({
	cusEnt,
}: {
	cusEnt: FullCustomerEntitlement;
}) => {
	if (nullish(cusEnt.entities)) {
		return {
			balance: 0,
			additional_balance: 0,
			adjustment: 0,
			unused: 0,
			count: 0,
		};
	}

	const entities = Object.values(cusEnt.entities);

	return {
		additional_balance: entities
			.reduce(
				(acc, curr) => acc.add(curr.additional_balance ?? 0),
				new Decimal(0),
			)
			.toNumber(),

		balance: entities
			.reduce((acc, curr) => acc.add(curr.balance), new Decimal(0))
			.toNumber(),

		adjustment: entities
			.reduce((acc, curr) => acc.add(curr.adjustment ?? 0), new Decimal(0))
			.toNumber(),

		unused: 0,
		count: entities.length,
	};
};

export const getCusEntBalance = ({
	cusEnt,
	entityId,
}: {
	cusEnt: FullCustomerEntitlement;
	entityId?: string | null;
}): {
	balance: number;
	additional_balance: number;
	adjustment: number;
	unused: number;
	count: number;
} => {
	const entitlement = cusEnt.entitlement;
	if (cusEnt.entitlement.allowance_type === AllowanceType.Unlimited) {
		return {
			balance: 0,
			additional_balance: 0,
			adjustment: 0,
			unused: 0,
			count: 1,
		};
	}

	if (notNullish(entitlement.entity_feature_id)) {
		if (nullish(entityId)) {
			return getSummedEntityBalances({
				cusEnt,
			});
		} else {
			const entityBalance = cusEnt.entities?.[entityId]?.balance;
			const adjustment = cusEnt.entities?.[entityId]?.adjustment || 0;

			if (nullish(entityBalance)) {
				return {
					balance: 0,
					additional_balance: 0,
					adjustment: 0,
					unused: 0,
					count: 1,
				};
			}

			return {
				balance: entityBalance || 0,
				additional_balance:
					cusEnt.entities?.[entityId]?.additional_balance || 0,
				adjustment,
				unused: 0,
				count: 1,
			};
		}
	}

	return {
		balance: cusEnt.balance || 0,
		additional_balance: cusEnt.additional_balance || 0,
		adjustment: cusEnt.adjustment || 0,
		unused: cusEnt.replaceables?.length || 0,
		count: 1,
	};
};

export const getMaxOverage = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}) => {
	const usageLimit = cusEnt.entitlement.usage_limit;
	if (nullish(usageLimit)) return undefined;

	if (!cusEnt.usage_allowed) return undefined;

	const maxOverage = new Decimal(usageLimit)
		.sub(cusEnt.entitlement.allowance || 0)
		.toNumber();

	return maxOverage;
};
