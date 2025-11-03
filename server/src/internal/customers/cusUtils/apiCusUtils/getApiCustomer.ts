import {
	AffectedResource,
	type ApiCustomer,
	applyResponseVersionChanges,
	type CusExpand,
	type CustomerLegacyData,
	type FullCustomer,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getCachedApiCustomer } from "../apiCusCacheUtils/getCachedApiCustomer.js";
import { getApiCustomerExpand } from "./getApiCustomerExpand.js";

/**
 * Get full ApiCustomer with expand fields and version changes applied
 */
export const getApiCustomer = async ({
	ctx,
	expand,
	withAutumnId = false,
	customerId,
	fullCus,
	skipCache = false,
}: {
	ctx: RequestContext;
	expand: CusExpand[];
	withAutumnId?: boolean;
	customerId?: string;
	fullCus?: FullCustomer;
	skipCache?: boolean;
}) => {
	// Get base customer (cacheable or direct from DB)
	const { apiCustomer: baseCustomer, legacyData: cusLegacyData } =
		await getCachedApiCustomer({
			ctx,
			customerId: customerId || "",
			withAutumnId,
			skipCache,
		});

	// Get expand fields (not cacheable)
	const apiCusExpand = await getApiCustomerExpand({
		ctx,
		customerId,
		expand,
		fullCus,
	});

	// Merge expand fields
	const apiCustomer = {
		...baseCustomer,
		...apiCusExpand,
	};

	return applyResponseVersionChanges<ApiCustomer, CustomerLegacyData>({
		input: apiCustomer,
		legacyData: cusLegacyData,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Customer,
	});
};
