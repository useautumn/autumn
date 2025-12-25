import { Decimal } from "decimal.js";
import {
	cusEntToPrepaidQuantity,
	type FullCusEntWithFullCusProduct,
	sumValues,
} from "../../..";

export const cusEntsToPrepaidQuantities = ({
	cusEnts,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
}) => {
	const prepaidQuantities = sumValues(
		cusEnts.map((cusEnt) => cusEntToPrepaidQuantity({ cusEnt })),
	);

	return new Decimal(prepaidQuantities).toNumber();
};
