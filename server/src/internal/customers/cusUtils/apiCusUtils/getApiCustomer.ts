import {
	AffectedResource,
	type ApiCustomer,
	type ApiCustomerV5,
	applyResponseVersionChanges,
	CusExpand,
	type CustomerLegacyData,
	type FullCustomer,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiCustomerBase } from "./getApiCustomerBase.js";
import { getApiCustomerExpand } from "./getApiCustomerExpand.js";
import { transformCustomerV4ToCustomerV5 } from "./transformCustomerV4ToCustomerV5.js";

/**
 * Transform FullCustomer to ApiCustomer with expand fields and version changes applied
 * 
 * Returns V5 format (V2.1), which is then transformed down to V4/V3/etc. by the version system
 */
export const getApiCustomer = async ({
	ctx,
	fullCustomer,
	withAutumnId = false,
}: {
	ctx: RequestContext;
	fullCustomer: FullCustomer;
	withAutumnId?: boolean;
}): Promise<ApiCustomer | ApiCustomerV5> => {
	// Get base ApiCustomer V4 (subscriptions, balances, invoices)
	const { apiCustomer: baseCustomer, legacyData: customerLegacyData } =
		await getApiCustomerBase({
			ctx,
			fullCus: fullCustomer,
			withAutumnId,
		});

	// Clean base customer (remove entities from base, handle expand)
	const cleanedBaseCustomer: ApiCustomer = {
		...baseCustomer,
		entities: undefined,
		autumn_id: withAutumnId ? baseCustomer.autumn_id : undefined,
		invoices: ctx.expand.includes(CusExpand.Invoices)
			? (baseCustomer.invoices ?? [])
			: undefined,
	};

	// Get expand params (rewards, referrals, etc.)
	const apiCustomerExpand = await getApiCustomerExpand({
		ctx,
		customerId: fullCustomer.id || fullCustomer.internal_id,
		fullCus: fullCustomer,
	});

	const apiCustomerV4: ApiCustomer = {
		...cleanedBaseCustomer,
		...apiCustomerExpand,
	};

	// Transform V4 → V5 (merge subscriptions, balances already in V1)
	const apiCustomerV5 = transformCustomerV4ToCustomerV5({
		customer: apiCustomerV4,
		legacyData: customerLegacyData,
	});

	// Apply version transformations based on API version (V5 → V4 for V2.0 clients, etc.)
	return applyResponseVersionChanges<ApiCustomerV5, CustomerLegacyData>({
		input: apiCustomerV5,
		legacyData: customerLegacyData,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Customer,
		ctx,
	});
};
