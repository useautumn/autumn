import {
	type ApiCustomerV5,
	type ApiInvoiceV1,
	type ApiVersionClass,
	type CustomerLegacyData,
	type FullSubject,
	getApiCustomerBaseV2,
	mergePlanBillingControlsForResponse,
	type SharedContext,
	shouldAggregateEntityData,
	subjectWithoutEntityData,
} from "@autumn/shared";

/** customers.get's body before expands and version changes: plan billing controls merged, internal fields stripped. */
export const fullSubjectToApiCustomerV5 = async ({
	ctx,
	fullSubject,
	apiVersion,
	withAutumnId = false,
	invoices,
}: {
	ctx: SharedContext;
	fullSubject: FullSubject;
	apiVersion: ApiVersionClass;
	withAutumnId?: boolean;
	/** Rendered by the caller when invoices are expanded; undefined when not. */
	invoices?: ApiInvoiceV1[];
}): Promise<{ apiCustomer: ApiCustomerV5; legacyData: CustomerLegacyData }> => {
	const subjectToUse =
		fullSubject.subjectType === "customer" &&
		!shouldAggregateEntityData({ apiVersion })
			? subjectWithoutEntityData({ fullSubject })
			: fullSubject;

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

	return {
		apiCustomer: {
			...baseCustomer,
			billing_controls: billingControls,
			entities: undefined,
			autumn_id: withAutumnId ? baseCustomer.autumn_id : undefined,
			invoices: invoices ? (baseCustomer.invoices ?? []) : undefined,
		},
		legacyData,
	};
};
