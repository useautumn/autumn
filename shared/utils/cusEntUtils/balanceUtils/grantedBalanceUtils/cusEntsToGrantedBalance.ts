import { Decimal } from "decimal.js";
import type { CustomerEntitlementWithPricesView } from "../../../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView";
import { cusEntsToAdjustment } from "./cusEntsToAdjustment";
import { cusEntsToAllowance } from "./cusEntsToAllowance";

export const cusEntsToGrantedBalance = ({
	cusEnts,
	entityId,
	withRollovers = false,
}: {
	cusEnts: CustomerEntitlementWithPricesView[];
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
