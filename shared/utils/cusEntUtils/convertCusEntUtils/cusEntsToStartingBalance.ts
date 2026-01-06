import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { sumValues } from "../../utils";
import { cusEntToStartingBalance } from "../balanceUtils/cusEntToStartingBalance";


export const cusEntsToStartingBalance = ({
	cusEnts,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
}) => {
	return sumValues(
		cusEnts.map((cusEnt) => cusEntToStartingBalance({ cusEnt })),
	);
};
