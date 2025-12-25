import { Decimal } from "decimal.js";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { sumValues } from "../../utils";
import { cusEntToBalance } from "../convertCusEntUtils";

export const cusEntsToCurrentBalance = ({
	cusEnts,
	entityId,
	withRollovers = false,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	entityId?: string;
	withRollovers?: boolean;
}) => {
	const cusEntToCurrentBalance = ({
		cusEnt,
		entityId,
		withRollovers = false,
	}: {
		cusEnt: FullCusEntWithFullCusProduct;
		entityId?: string;
		withRollovers?: boolean;
	}) => {
		const balance = cusEntToBalance({
			cusEnt,
			entityId,
			withRollovers,
		});

		const currentBalance = new Decimal(Math.max(0, balance)).toNumber();

		return currentBalance;
	};

	return sumValues(
		cusEnts.map((cusEnt) =>
			cusEntToCurrentBalance({ cusEnt, entityId, withRollovers }),
		),
	);
};
