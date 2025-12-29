import type { FullCusEntWithFullCusProduct, FullCusEntWithOptionalProduct } from "../../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { sumValues } from "../../../utils";
import { getCusEntBalance } from "../../balanceUtils";

export const cusEntsToAdjustment = ({
	cusEnts,
	entityId,
}: {
	cusEnts: (FullCusEntWithFullCusProduct | FullCusEntWithOptionalProduct)[];
	entityId?: string;
}) => {
	return sumValues(
		cusEnts.map((cusEnt) => {
			const { adjustment } = getCusEntBalance({
				cusEnt,
				entityId,
			});
			return adjustment;
		}),
	);
};
