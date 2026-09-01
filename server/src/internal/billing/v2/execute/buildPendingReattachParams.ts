import type {
	AttachParamsV1,
	BillingContext,
	FullCusProduct,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";

/** Rebuilds the attach that produced a pending plan, with the update's changes
 * applied over it. The deferred metadata keeps the resolved context rather than
 * the original request, so the payment settings are read back off it. */
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
