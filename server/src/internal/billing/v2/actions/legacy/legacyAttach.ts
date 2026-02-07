import type { BillingContextOverride, PlanTiming } from "@autumn/shared";
import { type AttachParamsV0, BillingVersion } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingActions } from "@/internal/billing/v2/actions";
import { attachParamsToStripeBillingContext } from "@/internal/billing/v2/actions/legacy/utils/attachParamsToStripeBillingContext";
import { setupLegacyTransitionContext } from "@/internal/billing/v2/actions/legacy/utils/setupLegacyFeatureQuantitiesContext";
import { billingResultToResponse } from "@/internal/billing/v2/utils/billingResult/billingResultToResponse";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams";

export const legacyAttach = async ({
	ctx,
	// body,
	attachParams,
	planTiming,
}: {
	ctx: AutumnContext;
	// body: AttachBodyV0;
	attachParams: AttachParams;
	planTiming: PlanTiming;
}) => {
	const fullProduct = {
		...attachParams.products[0],
		prices: attachParams.prices,
		entitlements: attachParams.entitlements,
	};

	const stripeBillingContext = await attachParamsToStripeBillingContext({
		ctx,
		attachParams,
		fullProduct,
	});

	const billingContextOverride: BillingContextOverride = {
		fullCustomer: attachParams.customer,
		productContext: {
			fullProduct,
		},

		stripeBillingContext,
		featureQuantities: attachParams.optionsList,
		transitionConfigs: setupLegacyTransitionContext({ attachParams }),
		billingVersion: BillingVersion.V1,
	};

	const fullCustomer = attachParams.customer;

	const params: AttachParamsV0 = {
		customer_id: fullCustomer.id || fullCustomer.internal_id,
		entity_id: fullCustomer.entity?.id,
		product_id: fullProduct.id,
		// items: body.items,
		// version: body.version,
		// invoice: body.invoice,
		// free_trial: body.free_trial === false ? null : undefined,

		invoice: attachParams.invoiceOnly,
		enable_product_immediately: true,
		finalize_invoice: attachParams.finalizeInvoice,

		redirect_mode: "if_required",

		plan_schedule: planTiming,
	};

	const res = await billingActions.attach({
		ctx,
		params,
		contextOverride: billingContextOverride,
	});

	const billingResponse = billingResultToResponse({
		billingContext: res.billingContext,
		billingResult: res.billingResult ?? { stripe: {} },
	});

	return {
		...res,
		billingResponse,
	};
};
