import { Decimal } from "decimal.js";
import type { CustomerEntitlementWithPricesView } from "../../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView";
import { nullish } from "../../utils";
import { cusEntsToBalance } from "./cusEntsToBalance";
import { cusEntsToPrepaidQuantity } from "./cusEntsToPrepaidQuantity";
import { cusEntsToGrantedBalance } from "./grantedBalanceUtils/cusEntsToGrantedBalance";

export const cusEntsToUsage = ({
	cusEnts,
	entityId,
}: {
	cusEnts: CustomerEntitlementWithPricesView[];
	entityId?: string;
}) => {
	const grantedBalance = cusEntsToGrantedBalance({ cusEnts, entityId });

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
