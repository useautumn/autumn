import type { FullCusEntWithFullCusProduct, FullCusEntWithOptionalProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { sumValues } from "../../utils";
import { cusEntToBalance } from "../convertCusEntUtils";

export const cusEntsToBalance = ({
	cusEnts,
	entityId,
	withRollovers = false,
}: {
	cusEnts: (FullCusEntWithFullCusProduct | FullCusEntWithOptionalProduct)[];
	entityId?: string;
	withRollovers?: boolean;
}) => {
	return sumValues(
		cusEnts.map((cusEnt) =>
			cusEntToBalance({ cusEnt, entityId, withRollovers }),
		),
	);
};
