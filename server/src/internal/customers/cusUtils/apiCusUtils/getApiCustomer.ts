import {
	AffectedResource,
	type ApiCustomerV5,
	applyResponseVersionChanges,
	CustomerExpand,
	type FullCustomer,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiCustomerBase } from "./getApiCustomerBase.js";
import { getApiCustomerExpand } from "./getApiCustomerExpand.js";

export const getApiCustomer = async ({
	ctx,
	fullCustomer,
	withAutumnId = false,
}: {
	ctx: RequestContext;
	fullCustomer: FullCustomer;
	withAutumnId?: boolean;
}): Promise<ApiCustomerV5> => {
	const { apiCustomer: baseCustomer, legacyData } = await getApiCustomerBase({
		ctx,
		fullCus: fullCustomer,
		withAutumnId,
	});

	const cleanedBaseCustomer: ApiCustomerV5 = {
		...baseCustomer,
		entities: undefined,
		autumn_id: withAutumnId ? baseCustomer.autumn_id : undefined,
		invoices: ctx.expand.includes(CustomerExpand.Invoices)
			? (baseCustomer.invoices ?? [])
			: undefined,
	};

	const apiCustomerExpand = await getApiCustomerExpand({
		ctx,
		customerId: fullCustomer.id || fullCustomer.internal_id,
		fullCus: fullCustomer,
	});

	const { billing_controls_override, ...standardExpand } = apiCustomerExpand;

	const apiCustomer: ApiCustomerV5 = {
		...cleanedBaseCustomer,
		...standardExpand,
		...(billing_controls_override
			? {
					billing_controls: {
						...cleanedBaseCustomer.billing_controls,
						auto_topups: billing_controls_override.auto_topups,
					},
				}
			: {}),
	};

	return applyResponseVersionChanges<ApiCustomerV5>({
		input: apiCustomer,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Customer,
		legacyData,
		ctx,
	});
};
