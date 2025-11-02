import {
	AffectedResource,
	type ApiCustomer,
	applyResponseVersionChanges,
	type CusExpand,
	type CustomerLegacyData,
	type FullCustomer,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiCusProducts } from "./getApiCusProduct/getApiCusProducts.js";
import { getApiCustomerBase } from "./getApiCustomerBase.js";
import { getApiCustomerExpand } from "./getApiCustomerExpand.js";

/**
 * Get full ApiCustomer with expand fields and version changes applied
 */
export const getApiCustomer = async ({
	ctx,
	fullCus,
	expand,
	withAutumnId = false,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
	expand: CusExpand[];
	withAutumnId?: boolean;
}) => {
	// Get base customer (cacheable)
	const baseCustomer = await getApiCustomerBase({
		ctx,
		fullCus,
		withAutumnId,
	});

	// Get expand fields (not cacheable)
	const apiCusExpand = await getApiCustomerExpand({
		ctx,
		fullCus,
		expand,
	});

	// Merge expand fields
	const apiCustomer = {
		...baseCustomer,
		...apiCusExpand,
	};

	// Get legacy data for version changes
	const { legacyData: cusProductLegacyData } = await getApiCusProducts({
		ctx,
		fullCus,
	});

	return applyResponseVersionChanges<ApiCustomer, CustomerLegacyData>({
		input: apiCustomer,
		legacyData: {
			cusProductLegacyData,
		},
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Customer,
	});
};
