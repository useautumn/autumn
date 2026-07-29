import {
	cusEntsToAllowance,
	isCustomerProductMain,
	isCustomerProductRecurring,
} from "../../../index.js";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";

export const cusEntsToMainPlanAllowance = ({
	cusEnts,
	entityId,
}: {
	cusEnts: FullCusEntWithFullCusProduct[];
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
