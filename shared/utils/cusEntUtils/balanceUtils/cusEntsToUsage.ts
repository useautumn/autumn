import { Decimal } from "decimal.js";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { cusEntsToBalance } from "./cusEntsToBalance";
import { cusEntsToPrepaidQuantity } from "./cusEntsToPrepaidQuantity";
import { cusEntsToGrantedBalance } from "./grantedBalanceUtils/cusEntsToGrantedBalance";

export const cusEntsToUsage = ({
	cusEnts,
	entityId,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	entityId?: string;
}) => {
	const grantedBalance = cusEntsToGrantedBalance({ cusEnts, entityId });

	const prepaidQuantity = cusEntsToPrepaidQuantity({ cusEnts });

	const balance = cusEntsToBalance({ cusEnts, entityId });

	return new Decimal(grantedBalance)
		.add(prepaidQuantity)
		.sub(balance)
		.toNumber();
};
