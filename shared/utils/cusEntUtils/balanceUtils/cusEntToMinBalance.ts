import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { notNullish } from "../../utils";
import { getMaxOverage } from "../balanceUtils";

export const cusEntToMinBalance = ({
	cusEnt,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
}) => {
	const maxOverage = getMaxOverage({ cusEnt });
	return notNullish(maxOverage) ? -maxOverage : undefined;
};
