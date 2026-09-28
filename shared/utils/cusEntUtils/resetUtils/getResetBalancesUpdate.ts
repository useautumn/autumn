import { Decimal } from "decimal.js";
import type {
	CustomerEntitlement,
	EntityBalance,
	UsageAttribution,
} from "../../../models/cusProductModels/cusEntModels/cusEntModels.js";
import type { Entitlement } from "../../../models/productModels/entModels/entModels.js";
import { notNullish } from "../../utils.js";

export type ResetBalancesUpdate = (
	| { entities: Record<string, EntityBalance> }
	| { balance: number; additional_balance: number; adjustment: number }
) & { usage_attribution: UsageAttribution };

/** What a refill reads: the balances being replaced and the grant that sizes them. */
export type ResetBalancesCustomerEntitlement = Pick<
	CustomerEntitlement,
	"balance" | "entities"
> & {
	entitlement: Pick<Entitlement, "allowance" | "entity_feature_id">;
};

/** Returns the overage amount to deduct: max(0, -balance). */
const computeOverageDeduction = ({ balance }: { balance: number }): Decimal => {
	return Decimal.max(0, new Decimal(balance).neg());
};

export const getResetBalancesUpdate = ({
	cusEnt,
	allowance,
	persistFreeOverage = false,
}: {
	cusEnt: ResetBalancesCustomerEntitlement;
	allowance?: number;
	persistFreeOverage?: boolean;
}): ResetBalancesUpdate => {
	const newBalance = notNullish(allowance)
		? allowance!
		: cusEnt.entitlement.allowance || 0;

	const entitlement = cusEnt.entitlement;

	if (notNullish(entitlement.entity_feature_id)) {
		const newEntities: Record<string, EntityBalance> = {};
		for (const [entityId, entity] of Object.entries(cusEnt.entities ?? {})) {
			let entityResetBalance = newBalance;

			if (persistFreeOverage) {
				const overage = computeOverageDeduction({
					balance: entity.balance,
				});
				entityResetBalance = new Decimal(newBalance).sub(overage).toNumber();
			}

			newEntities[entityId] = {
				...entity,
				balance: entityResetBalance,
				adjustment: 0,
			};
		}
		return { entities: newEntities, usage_attribution: {} };
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
		usage_attribution: {},
	};
};
