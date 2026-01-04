import { getRolloverFields, notNullish } from "../../..";
import type { ApiBalanceRollover } from "../../../api/customers/cusFeatures/apiBalance";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";

export const cusEntsToRollovers = ({
	cusEnts,
	entityId,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	entityId?: string;
}): ApiBalanceRollover[] | undefined => {
	// If all cus ents no rollover, return undefined

	if (cusEnts.every((cusEnt) => !cusEnt.entitlement.rollover)) {
		return undefined;
	}

	return cusEnts
		.map((cusEnt) => {
			const rolloverFields = getRolloverFields({ cusEnt, entityId });
			if (rolloverFields)
				return rolloverFields.rollovers.map((rollover) => ({
					balance: rollover.balance,
					expires_at: rollover.expires_at || 0,
				}));
			return [];
		})
		.filter(notNullish)
		.flat();
};
