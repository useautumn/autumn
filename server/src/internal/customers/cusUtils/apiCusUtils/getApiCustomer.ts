import {
	AffectedResource,
	type ApiCustomer,
	applyResponseVersionChanges,
	type CustomerLegacyData,
	type FullCustomer,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiCustomerBase } from "./getApiCustomerBase.js";
import { getApiCustomerExpand } from "./getApiCustomerExpand.js";

/**
 * Get full ApiCustomer with expand fields and version changes applied
 */
export const getApiCustomer = async ({
	ctx,
	fullCus,
	withAutumnId = false,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
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
	});

	// Merge expand fields
	const apiCustomer = {
		...baseCustomer.cus,
		...apiCusExpand,
	};

	// Get legacy data for version changes
	return applyResponseVersionChanges<ApiCustomer, CustomerLegacyData>({
		input: apiCustomer,
		legacyData: {
			cusProductLegacyData: baseCustomer.legacyData.cusProductLegacyData,
			cusFeatureLegacyData: baseCustomer.legacyData.cusFeaturesLegacyData,
		},
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Customer,
	});
};
