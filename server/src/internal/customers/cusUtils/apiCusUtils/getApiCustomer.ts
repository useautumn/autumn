import {
	AffectedResource,
	type ApiCustomer,
	applyResponseVersionChanges,
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
	withAutumnId = false,
	customerId,
	fullCus,
	skipCache = false,
	baseData,
}: {
	ctx: RequestContext;
	withAutumnId?: boolean;
	customerId?: string;
	fullCus?: FullCustomer;
	skipCache?: boolean;
	baseData?: { apiCustomer: ApiCustomer; legacyData: CustomerLegacyData };
}) => {
	let baseCustomer: ApiCustomer;
	let cusLegacyData: CustomerLegacyData;

	if (!baseData) {
		const { apiCustomer, legacyData } = await getCachedApiCustomer({
			ctx,
			customerId: customerId || "",
			skipCache,
		});
		baseCustomer = apiCustomer;
		cusLegacyData = legacyData;
	} else {
		baseCustomer = baseData.apiCustomer;
		cusLegacyData = baseData.legacyData;
	}

	// Clean api customer
	baseCustomer = {
		...baseCustomer,
		entities: undefined,
		autumn_id: withAutumnId ? baseCustomer.autumn_id : undefined,
	};

	// Get expand fields (not cacheable)
	const apiCusExpand = await getApiCustomerExpand({
		ctx,
		customerId,
		fullCus,
	});

	// Merge expand fields
	const apiCustomer = {
		...baseCustomer,
		...apiCusExpand,
	};

	// Get legacy data for version changes
	return applyResponseVersionChanges<ApiCustomer, CustomerLegacyData>({
		input: apiCustomer,
		legacyData: cusLegacyData,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Customer,
	});
};
