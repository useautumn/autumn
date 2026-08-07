import {
	AffectedResource,
	type ApiCustomerV5,
	applyResponseVersionChanges,
	CustomerExpand,
	type FullSubject,
	mergePlanBillingControlsForResponse,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiCustomerExpandV2 } from "../apiCusUtils/getApiCustomerExpandV2.js";
import {
	shouldAggregateEntityData,
	subjectWithoutEntityData,
} from "../customerEntityData.js";
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
	// Entity-scoped reads already report only their own rows; this drops the
	// aggregated view a customer-level read used to fold in.
	const subjectToUse =
		fullSubject.subjectType === "customer" &&
		!shouldAggregateEntityData({ apiVersion: ctx.apiVersion })
			? subjectWithoutEntityData({ fullSubject })
			: fullSubject;

	const { apiCustomer: baseCustomer, legacyData } = await getApiCustomerBaseV2({
		ctx,
		fullSubject: subjectToUse,
		withAutumnId,
	});

	const billingControls = mergePlanBillingControlsForResponse({
		billingControls: baseCustomer.billing_controls,
		planCustomerProducts: fullSubject.customer_products,
		fullSubject,
		features: ctx.features,
	});

	const cleanedBaseCustomer: ApiCustomerV5 = {
		...baseCustomer,
		billing_controls: billingControls,
		entities: undefined,
		autumn_id: withAutumnId ? baseCustomer.autumn_id : undefined,
		invoices: ctx.expand.includes(CustomerExpand.Invoices)
			? (baseCustomer.invoices ?? [])
			: undefined,
	};

	const apiCustomerExpand = await getApiCustomerExpandV2({
		ctx,
		fullSubject,
		autoTopupsConfig: billingControls.auto_topups,
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
