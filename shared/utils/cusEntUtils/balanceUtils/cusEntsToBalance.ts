import type { FullCustomerEntitlementView } from "../../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";
import { sumValues } from "../../utils";
import { cusEntToBalance } from "../convertCusEntUtils";

export const cusEntsToBalance = ({
	cusEnts,
	entityId,
	withRollovers = false,
}: {
	cusEnts: FullCustomerEntitlementView[];
	entityId?: string;
	withRollovers?: boolean;
}) => {
	return sumValues(
		cusEnts.map((cusEnt) =>
			cusEntToBalance({ cusEnt, entityId, withRollovers }),
		),
	);
};
