import type {
	AttachParamsV1,
	DeferredAutumnBillingPlanData,
	FullCusProduct,
	UpdateSubscriptionV1Params,
} from "@autumn/shared";
import { CusProductStatus, ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingActions } from "@/internal/billing/v2/actions";
import { handleUnknownFeatureQuantityErrors } from "@/internal/billing/v2/actions/updateSubscription/errors/handleUnknownFeatureQuantityErrors";
import { buildPendingReattachParams } from "@/internal/billing/v2/execute/pendingCustomerProducts/buildPendingReattachParams";
import { getPendingPlanLongLivedCheckout } from "@/internal/billing/v2/execute/pendingCustomerProducts/getPendingPlanLongLivedCheckout";
import { pendingPlanRebills } from "@/internal/billing/v2/execute/pendingCustomerProducts/pendingPlanRebills";
import { isPlanEnabledOnFinalize } from "@/internal/billing/v2/utils/billingContext/isPlanEnabledOnFinalize";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

/** Previews the pending plan re-attached with the edit, and whether that needs a new payment. */
export const previewPendingReattach = async ({
	ctx,
	params,
	customerProduct,
	deferredData,
}: {
	ctx: AutumnContext;
	params: UpdateSubscriptionV1Params;
	customerProduct: FullCusProduct;
	deferredData: DeferredAutumnBillingPlanData;
}) => {
	const enablesNow =
		params.invoice_mode?.enable_plan_immediately === true &&
		!isPlanEnabledOnFinalize({ billingContext: deferredData.billingContext });
	if (enablesNow) {
		const hasFuturePhases =
			(deferredData.billingPlan.autumn.schedulePhases?.length ?? 0) > 1;
		const pendingProductsWithPayment = customerProduct.metadata_id
			? await CusProductService.getByMetadataId({
					db: ctx.db,
					metadataId: customerProduct.metadata_id,
					orgId: ctx.org.id,
					env: ctx.env,
					inStatuses: [CusProductStatus.Pending],
				})
			: [];
		const hasSharedPendingPayment = pendingProductsWithPayment.length > 1;
		if (hasFuturePhases || hasSharedPendingPayment) {
			throw new RecaseError({
				message:
					"Cannot enable this pending plan immediately because it belongs to a scheduled set of plans. Enable this from set plans instead.",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}
	}

	const reattachParams = buildPendingReattachParams({
		ctx,
		params,
		billingContext: deferredData.billingContext,
		customerProduct,
	});

	// A plan opened from a long-lived link keeps the link's params (discounts, redirects) under the edit.
	const longLivedCheckout = await getPendingPlanLongLivedCheckout({
		ctx,
		deferredData,
	});
	const attachParams: AttachParamsV1 = longLivedCheckout
		? {
				...(longLivedCheckout.params as AttachParamsV1),
				...reattachParams,
				long_lived_checkout: false,
			}
		: reattachParams;

	const pendingMetadata = customerProduct.metadata_id
		? await MetadataService.get({ db: ctx.db, id: customerProduct.metadata_id })
		: undefined;
	const contextOverride = {
		replacedPendingStripeInvoiceId:
			pendingMetadata?.stripe_invoice_id ?? undefined,
	};

	const replacementPreview = await billingActions.attach({
		ctx,
		params: attachParams,
		preview: true,
		contextOverride,
	});

	const replacementProduct =
		replacementPreview.billingContext?.fullProducts?.[0];
	// Checked here, before a rebilling edit discards the pending payment for an attach that would drop the quantity.
	if (replacementProduct)
		handleUnknownFeatureQuantityErrors({
			fullProduct: replacementProduct,
			params,
		});

	const rebills =
		enablesNow ||
		pendingPlanRebills({
			ctx,
			customerProduct,
			replacementProduct,
			replacementQuantities:
				replacementPreview.billingContext?.featureQuantities ?? [],
		});

	return {
		attachParams,
		contextOverride,
		longLivedCheckout,
		replacementPreview,
		rebills,
	};
};
