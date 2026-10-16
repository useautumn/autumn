import type {
	AttachParamsV1,
	BillingContext,
	FullCusProduct,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { pendingPlanToReattachCustomize } from "@/internal/billing/v2/execute/pendingCustomerProducts/pendingPlanToReattachCustomize";
import { invoiceModeToIssueMethod } from "@/internal/billing/v2/utils/invoiceMode/invoiceModeIssueMethod";

export const buildPendingReattachParams = ({
	ctx,
	params,
	billingContext,
	customerProduct,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
	billingContext: BillingContext;
	customerProduct: FullCusProduct;
}): AttachParamsV1 => {
	const { invoiceMode } = billingContext;
	const enablesNow = params.invoice_mode?.enable_plan_immediately === true;
	const issueMethod = invoiceMode && invoiceModeToIssueMethod({ invoiceMode });
	const shouldFinalizeInvoiceForImmediateEnable =
		enablesNow && issueMethod === "draft";

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
		customize: pendingPlanToReattachCustomize({
			ctx,
			customize: params.customize,
			customerProduct,
		}),
		version: params.version,
		...(enablesNow && {
			billing_cycle_anchor: params.billing_cycle_anchor,
			proration_behavior: params.proration_behavior,
		}),
		enable_plan_immediately: enablesNow || billingContext.enablePlanImmediately,
		invoice_mode: (invoiceMode || enablesNow) && {
			enabled: true,
			enable_plan_immediately:
				enablesNow || invoiceMode?.enableProductImmediately,
			issue_method: shouldFinalizeInvoiceForImmediateEnable
				? "finalize"
				: issueMethod,
			net_terms_days: invoiceMode?.daysUntilDue,
		},
	} as AttachParamsV1;
};
