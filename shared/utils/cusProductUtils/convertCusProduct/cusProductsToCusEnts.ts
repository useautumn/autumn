import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import type { FullCusProduct } from "../../../models/cusProductModels/cusProductModels.js";
import { sortCusEntsForDeduction } from "../../cusEntUtils/sortCusEntsForDeduction.js";

export const cusProductsToCusEnts = ({
	cusProducts,
	featureId,
}: {
	cusProducts: FullCusProduct[];
	featureId?: string;
}) => {
	let cusEnts: FullCusEntWithFullCusProduct[] = [];

	for (const cusProduct of cusProducts) {
		cusEnts.push(
			...cusProduct.customer_entitlements.map((cusEnt) => ({
				...cusEnt,
				customer_product: cusProduct,
			})),
		);
	}

	if (featureId) {
		cusEnts = cusEnts.filter(
			(cusEnt) => cusEnt.entitlement.feature.id === featureId,
		);
	}

	sortCusEntsForDeduction({
		cusEnts,
	});

	return cusEnts as FullCusEntWithFullCusProduct[];
};
