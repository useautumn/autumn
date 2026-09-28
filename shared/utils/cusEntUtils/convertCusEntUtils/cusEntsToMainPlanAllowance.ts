import {
	cusEntsToAllowance,
	isCustomerProductMain,
	isCustomerProductRecurring,
} from "../../../index.js";
import type { CustomerEntitlementWithPricesView } from "../../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";

export const cusEntsToMainPlanAllowance = ({
	cusEnts,
	entityId,
}: {
	cusEnts: CustomerEntitlementWithPricesView[];
	entityId?: string;
}): number =>
	cusEntsToAllowance({
		cusEnts: cusEnts.filter(
			(cusEnt) =>
				cusEnt.customer_product &&
				isCustomerProductMain(cusEnt.customer_product) &&
				isCustomerProductRecurring(cusEnt.customer_product),
		),
		entityId,
		withRollovers: false,
	});
