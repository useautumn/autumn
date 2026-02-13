import type { FullCusEntWithFullCusProduct } from "@models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import { getRolloverFields } from "@utils/cusEntUtils/getRolloverFields.js";
import { Decimal } from "decimal.js";
import { sumValues } from "../../../utils.js";

const cusEntToRolloverBalance = ({
	cusEnt,
	entityId,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	entityId?: string;
}) => {
	const rollover = getRolloverFields({ cusEnt, entityId });

	return new Decimal(rollover?.balance ?? 0).toNumber();
};

export const cusEntsToRolloverBalance = ({
	cusEnts,
	entityId,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	entityId?: string;
}) => {
	return sumValues(
		cusEnts.map((cusEnt) => cusEntToRolloverBalance({ cusEnt, entityId })),
	);
};
