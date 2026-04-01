import type { EntityBalance, FullCustomerEntitlement } from "@autumn/shared";
import { Decimal } from "decimal.js";
import { notNullish } from "@/utils/genUtils.js";

export type ResetBalancesUpdate =
	| { entities: Record<string, EntityBalance> }
	| { balance: number; additional_balance: number; adjustment: number };

/** Returns the overage amount to deduct: max(0, -balance). */
const computeOverageDeduction = ({ balance }: { balance: number }): Decimal => {
	return Decimal.max(0, new Decimal(balance).neg());
};

export const getResetBalancesUpdate = ({
	cusEnt,
	allowance,
	persistFreeOverage = false,
}: {
	cusEnt: FullCustomerEntitlement;
	allowance?: number;
	persistFreeOverage?: boolean;
}): ResetBalancesUpdate => {
	const newBalance = notNullish(allowance)
		? allowance!
		: cusEnt.entitlement.allowance || 0;

	const entitlement = cusEnt.entitlement;

	if (notNullish(entitlement.entity_feature_id)) {
		const newEntities = { ...cusEnt.entities };
		for (const entityId in newEntities) {
			const entity = newEntities[entityId];
			let entityResetBalance = newBalance;

			if (persistFreeOverage) {
				const overage = computeOverageDeduction({
					balance: entity.balance,
				});
				entityResetBalance = new Decimal(newBalance).sub(overage).toNumber();
			}

			newEntities[entityId].balance = entityResetBalance;
			newEntities[entityId].adjustment = 0;
		}
		return { entities: newEntities };
	}

	let resetBalance = newBalance;
	if (persistFreeOverage) {
		const overage = computeOverageDeduction({
			balance: cusEnt.balance ?? 0,
		});
		resetBalance = new Decimal(newBalance).sub(overage).toNumber();
	}

	return {
		balance: resetBalance,
		additional_balance: 0,
		adjustment: 0,
	};
};
