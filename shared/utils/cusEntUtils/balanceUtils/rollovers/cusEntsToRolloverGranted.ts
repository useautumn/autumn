import type { FullCusEntWithFullCusProduct } from "@models/cusProductModels/cusEntModels/cusEntWithProduct";
import { getRolloverFields } from "@utils/cusEntUtils/getRolloverFields";
import { Decimal } from "decimal.js";
import { sumValues } from "../../../utils";

const cusEntToRolloverGranted = ({
	cusEnt,
	entityId,
}: {
	cusEnt: FullCusEntWithFullCusProduct;
	entityId?: string;
}) => {
	const rollover = getRolloverFields({ cusEnt, entityId });

	return new Decimal(rollover?.balance ?? 0)
		.add(rollover?.usage ?? 0)
		.toNumber();
};

export const cusEntsToRolloverGranted = ({
	cusEnts,
	entityId,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	entityId?: string;
}) => {
	return sumValues(
		cusEnts.map((cusEnt) => cusEntToRolloverGranted({ cusEnt, entityId })),
	);
};
