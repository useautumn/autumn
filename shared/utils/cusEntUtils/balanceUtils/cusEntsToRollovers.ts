import type { ApiBalanceRolloverV0 } from "@api/customers/cusFeatures/components/apiBalanceRollover/apiBalanceRolloverV0";
import { getRolloverFields, notNullish } from "../../..";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";

export const cusEntsToRollovers = ({
	cusEnts,
	entityId,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	entityId?: string;
}): ApiBalanceRolloverV0[] | undefined => {
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
