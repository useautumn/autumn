import { Decimal } from "decimal.js";
import type { FullCusEntWithFullCusProduct } from "../../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { cusEntsToAdjustment } from "./cusEntsToAdjustment";
import { cusEntsToAllowance } from "./cusEntsToAllowance";

export const cusEntsToGrantedBalance = ({
	cusEnts,
	entityId,
	withRollovers = false,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	entityId?: string;
	withRollovers?: boolean;
}) => {
	const totalAllowance = cusEntsToAllowance({
		cusEnts,
		entityId,
		withRollovers,
	});

	const totalAdjustment = cusEntsToAdjustment({
		cusEnts,
		entityId,
	});

	return new Decimal(totalAllowance).add(totalAdjustment).toNumber();
};
