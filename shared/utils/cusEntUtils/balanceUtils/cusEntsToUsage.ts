import { Decimal } from "decimal.js";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { nullish } from "../../utils";
import { cusEntsToBalance } from "./cusEntsToBalance";
import { cusEntsToPrepaidQuantity } from "./cusEntsToPrepaidQuantity";
import { cusEntsToAdjustment } from "./grantedBalanceUtils/cusEntsToAdjustment";
import { cusEntsToAllowance } from "./grantedBalanceUtils/cusEntsToAllowance";

export const cusEntsToUsage = ({
	cusEnts,
	entityId,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
	entityId?: string;
}) => {
	const allowance = cusEntsToAllowance({ cusEnts, entityId });
	const adjustment = cusEntsToAdjustment({ cusEnts, entityId });

	const prepaidQuantity = cusEntsToPrepaidQuantity({
		cusEnts,
		sumAcrossEntities: nullish(entityId),
	});

	const balance = cusEntsToBalance({ cusEnts, entityId });

	return new Decimal(allowance)
		.add(adjustment)
		.add(prepaidQuantity)
		.sub(balance)
		.toNumber();
};
