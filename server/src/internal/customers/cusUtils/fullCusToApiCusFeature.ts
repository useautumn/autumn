import {
	CusProductStatus,
	cusProductsToCusEnts,
	type Feature,
	type FullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { getApiCusFeature } from "./apiCusUtils/getApiCusFeature/getApiCusFeature.js";

export const fullCusToApiCusFeature = ({
	ctx,
	fullCus,
	feature,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	feature: Feature;
}) => {
	const cusEnts = cusProductsToCusEnts({
		cusProducts: fullCus.customer_products,
		inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
	});
	return getApiCusFeature({
		ctx,
		fullCus,
		cusEnts,
		feature,
	});
};
