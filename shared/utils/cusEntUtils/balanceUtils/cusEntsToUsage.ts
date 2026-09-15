import { Decimal } from "decimal.js";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct";
import { nullish } from "../../utils";
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

	// An expiring item's purchases live on loose grant rows; its option
	// quantity only sizes the charge, so counting it here would invent usage.
	const prepaidQuantity = cusEntsToPrepaidQuantity({
		cusEnts: cusEnts.filter((cusEnt) => !cusEnt.entitlement.expiry_duration),
		sumAcrossEntities: nullish(entityId),
	});

	const balance = cusEntsToBalance({ cusEnts, entityId });

	return new Decimal(grantedBalance)
		.add(prepaidQuantity)
		.sub(balance)
		.toNumber();
};
