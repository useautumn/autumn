import type {
	AttachParamsV1,
	BillingContext,
	FullCusProduct,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";

export const buildPendingReattachParams = ({
	params,
	billingContext,
	customerProduct,
}: {
	params: UpdateSubscriptionV1Params;
	billingContext: BillingContext;
	customerProduct: FullCusProduct;
}): AttachParamsV1 => {
	const { invoiceMode } = billingContext;

	const featureQuantities =
		params.feature_quantities ??
		billingContext.featureQuantities.map((featureQuantity) => ({
			feature_id: featureQuantity.feature_id,
			quantity: featureQuantity.quantity ?? 0,
		}));

	return {
		customer_id: params.customer_id,
		plan_id: customerProduct.product.id,
		entity_id: params.entity_id ?? customerProduct.entity_id ?? undefined,
		feature_quantities: featureQuantities,
		customize: params.customize,
		version: params.version,
		enable_plan_immediately: billingContext.enablePlanImmediately,
		invoice_mode: invoiceMode && {
			enabled: true,
			enable_plan_immediately: invoiceMode.enableProductImmediately,
			finalize: invoiceMode.finalizeInvoice,
			net_terms_days: invoiceMode.daysUntilDue,
		},
	} as AttachParamsV1;
};
