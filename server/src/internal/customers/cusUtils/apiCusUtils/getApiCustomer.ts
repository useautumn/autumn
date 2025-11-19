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
	baseData,
}: {
	ctx: RequestContext;
	withAutumnId?: boolean;
	customerId?: string;
	fullCus?: FullCustomer;
	baseData?: { apiCustomer: ApiCustomer; legacyData: CustomerLegacyData };
}) => {
	const getBaseCustomer = async () => {
		let baseCustomer: ApiCustomer;
		let cusLegacyData: CustomerLegacyData;
		if (!baseData) {
			const start = Date.now();
			const { apiCustomer, legacyData } = await getCachedApiCustomer({
				ctx,
				customerId: customerId || "",
			});

			ctx.logger.info(`getCachedApiCustomer: ${Date.now() - start}ms`);

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

		return { baseCustomer, cusLegacyData };
	};

	const getExpandParams = async () => {
		const expandStart = Date.now();
		const apiCusExpand = await getApiCustomerExpand({
			ctx,
			customerId,
			fullCus: fullCus || undefined,
		});
		ctx.logger.info(`getApiCustomerExpand: ${Date.now() - expandStart}ms`);
		return apiCusExpand;
	};

	const [{ baseCustomer, cusLegacyData }, apiCusExpand] = await Promise.all([
		getBaseCustomer(),
		getExpandParams(),
	]);

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
