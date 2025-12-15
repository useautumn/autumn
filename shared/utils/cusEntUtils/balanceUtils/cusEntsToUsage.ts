import { Decimal } from "decimal.js";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { cusEntsToBalance } from "./cusEntsToBalance";
import { cusEntsToPurchasedBalance } from "./cusEntsToPurchasedBalance";
import { cusEntsToGrantedBalance } from "./grantedBalanceUtils/cusEntsToGrantedBalance";

export const cusEntsToUsage = ({
	cusEnts,
	entityId,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	entityId?: string;
}) => {
	const grantedBalance = cusEntsToGrantedBalance({ cusEnts, entityId });

	const purchasedBalance = cusEntsToPurchasedBalance({ cusEnts, entityId });

	const currentBalance = cusEntsToBalance({ cusEnts, entityId });

	return new Decimal(grantedBalance)
		.add(purchasedBalance)
		.sub(currentBalance)
		.toNumber();
};
