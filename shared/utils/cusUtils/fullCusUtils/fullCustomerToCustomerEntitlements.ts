import type { Entity } from "../../../models/cusModels/entityModels/entityModels.js";
import type { FullCustomer } from "../../../models/cusModels/fullCusModel.js";
import type { SortCusEntParams } from "../../../models/cusProductModels/cusEntModels/cusEntModels.js";
import type { FullCusEntWithFullCusProduct } from "../../../models/cusProductModels/cusEntModels/cusEntWithProduct.js";
import { CusProductStatus } from "../../../models/cusProductModels/cusProductEnums.js";
import { cusEntMatchesEntity } from "../../cusEntUtils/filterCusEntUtils.js";
import { sortCusEntsForDeduction } from "../../cusEntUtils/sortCusEntsForDeduction.js";
import { notNullish } from "../../utils.js";

export const fullCustomerToCustomerEntitlements = ({
	fullCustomer,
	inStatuses = [CusProductStatus.Active, CusProductStatus.PastDue],
	reverseOrder = false,
	featureId,
	featureIds,
	entity,
	sortParams,
}: {
	fullCustomer: FullCustomer;
	inStatuses?: CusProductStatus[];
	reverseOrder?: boolean;
	featureId?: string;
	featureIds?: string[];
	entity?: Entity;
	sortParams?: SortCusEntParams;
}) => {
	const cusProducts = fullCustomer.customer_products;
	let cusEnts: FullCusEntWithFullCusProduct[] = [];

	for (const cusProduct of cusProducts) {
		if (!inStatuses.includes(cusProduct.status)) continue;

		cusEnts.push(
			...cusProduct.customer_entitlements.map((cusEnt) => ({
				...cusEnt,
				customer_product: cusProduct,
			})),
		);
	}

	for (const cusEnt of fullCustomer.extra_customer_entitlements) {
		cusEnts.push({
			...cusEnt,
			customer_product: null,
		});
	}

	if (featureId) {
		cusEnts = cusEnts.filter(
			(cusEnt) => cusEnt.entitlement.feature.id === featureId,
		);
	}

	if (featureIds) {
		cusEnts = cusEnts.filter((cusEnt) =>
			featureIds.includes(cusEnt.entitlement.feature.id),
		);
	}

	if (entity) {
		cusEnts = cusEnts.filter((cusEnt) =>
			cusEntMatchesEntity({
				cusEnt: cusEnt,
				entity,
			}),
		);
	}

	sortCusEntsForDeduction({
		cusEnts,
		reverseOrder,
		entityId: entity?.id,
		// sortParams,
	});

	if (sortParams?.cusEntId) {
		cusEnts = cusEnts.filter((cusEnt) => cusEnt.id === sortParams.cusEntId);
	}

	if (notNullish(sortParams?.interval)) {
		cusEnts = cusEnts.filter(
			(cusEnt) => cusEnt.entitlement.interval === sortParams.interval,
		);
	}

	return cusEnts as FullCusEntWithFullCusProduct[];
};
