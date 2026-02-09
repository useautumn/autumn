import {
	AffectedResource,
	type ApiCustomerV5,
	applyResponseVersionChanges,
	CusExpand,
	type CustomerLegacyData,
	type FullCustomer,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiCustomerBase } from "./getApiCustomerBase.js";
import { getApiCustomerExpand } from "./getApiCustomerExpand.js";

/**
 * Transform FullCustomer to ApiCustomer with expand fields and version changes applied
 */
export const getApiCustomer = async ({
	ctx,
	fullCustomer,
	withAutumnId = false,
}: {
	ctx: RequestContext;
	fullCustomer: FullCustomer;
	withAutumnId?: boolean;
}): Promise<ApiCustomerV5> => {
	// Get base ApiCustomer (subscriptions, balances, invoices)
	const { apiCustomer: baseCustomer, legacyData: customerLegacyData } =
		await getApiCustomerBase({
			ctx,
			fullCus: fullCustomer,
			withAutumnId,
		});

	// Clean base customer (remove entities from base, handle expand)
	const cleanedBaseCustomer: ApiCustomerV5 = {
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

	const apiCustomer: ApiCustomerV5 = {
		...cleanedBaseCustomer,
		...apiCustomerExpand,
	};

	// Apply version transformations based on API version
	return applyResponseVersionChanges<ApiCustomerV5, CustomerLegacyData>({
		input: apiCustomer,
		legacyData: customerLegacyData,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Customer,
		ctx,
	});
};
