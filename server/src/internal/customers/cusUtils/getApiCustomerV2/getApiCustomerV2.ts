import {
	AffectedResource,
	type ApiCustomerV5,
	applyResponseVersionChanges,
	CustomerExpand,
	type FullSubject,
	getApiCustomerBaseV2,
	mergePlanBillingControlsForResponse,
	shouldAggregateEntityData,
	subjectWithoutEntityData,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { invoicesToResponse } from "@/internal/invoices/invoiceUtils.js";
import { getApiCustomerExpandV2 } from "../apiCusUtils/getApiCustomerExpandV2.js";

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
	const subjectToUse =
		fullSubject.subjectType === "customer" &&
		!shouldAggregateEntityData({ apiVersion: ctx.apiVersion })
			? subjectWithoutEntityData({ fullSubject })
			: fullSubject;

	// An invoice's hosted URL is built from this server's address, so invoices are rendered here and handed in.
	const shouldExpandInvoices = ctx.expand.includes(CustomerExpand.Invoices);
	const invoices =
		subjectToUse.invoices && shouldExpandInvoices
			? invoicesToResponse({ invoices: subjectToUse.invoices })
			: undefined;

	const { apiCustomer: baseCustomer, legacyData } = await getApiCustomerBaseV2({
		ctx,
		fullSubject: subjectToUse,
		withAutumnId,
		invoices,
	});

	const billingControls = mergePlanBillingControlsForResponse({
		billingControls: baseCustomer.billing_controls,
		planCustomerProducts: subjectToUse.customer_products,
		fullSubject: subjectToUse,
		features: ctx.features,
	});

	const cleanedBaseCustomer: ApiCustomerV5 = {
		...baseCustomer,
		billing_controls: billingControls,
		entities: undefined,
		autumn_id: withAutumnId ? baseCustomer.autumn_id : undefined,
		invoices: shouldExpandInvoices ? (baseCustomer.invoices ?? []) : undefined,
	};

	const apiCustomerExpand = await getApiCustomerExpandV2({
		ctx,
		fullSubject: subjectToUse,
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
