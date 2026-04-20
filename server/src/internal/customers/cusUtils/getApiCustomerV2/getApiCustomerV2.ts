import {
	AffectedResource,
	type ApiCustomerV5,
	applyResponseVersionChanges,
	CustomerExpand,
	type FullSubject,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiCustomerExpandV2 } from "../apiCusUtils/getApiCustomerExpandV2.js";
import { getApiCustomerBaseV2 } from "./getApiCustomerBaseV2.js";

/**
 * Transform FullSubject to ApiCustomer with expand fields and version changes applied.
 */
export const getApiCustomerV2 = async ({
	ctx,
	fullSubject,
	withAutumnId = false,
}: {
	ctx: RequestContext;
	fullSubject: FullSubject;
	withAutumnId?: boolean;
}): Promise<ApiCustomerV5> => {
	const { apiCustomer: baseCustomer, legacyData } = await getApiCustomerBaseV2({
		ctx,
		fullSubject,
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

	const apiCustomerExpand = await getApiCustomerExpandV2({
		ctx,
		fullSubject,
	});

	const apiCustomer: ApiCustomerV5 = {
		...cleanedBaseCustomer,
		...apiCustomerExpand,
	};

	return applyResponseVersionChanges<ApiCustomerV5>({
		input: apiCustomer,
		targetVersion: ctx.apiVersion,
		resource: AffectedResource.Customer,
		legacyData,
		ctx,
	});
};
