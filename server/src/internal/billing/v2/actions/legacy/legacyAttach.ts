import type {
	AttachParamsV1,
	BillingContextOverride,
	PlanTiming,
} from "@autumn/shared";
import { BillingVersion } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingActions } from "@/internal/billing/v2/actions";
import { attachParamsToInvoiceModeParams } from "@/internal/billing/v2/actions/legacy/utils/attachParamsToInvoiceModeParams";
import { attachParamsToStripeBillingContext } from "@/internal/billing/v2/actions/legacy/utils/attachParamsToStripeBillingContext";
import { legacyRewardToAttachDiscounts } from "@/internal/billing/v2/actions/legacy/utils/legacyRewardToAttachDiscounts";
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

	const paramDiscounts = legacyRewardToAttachDiscounts({ attachParams });

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
		transitionConfig: setupLegacyTransitionContext({ attachParams }),
		billingVersion: BillingVersion.V1,
	};

	const fullCustomer = attachParams.customer;

	const params: AttachParamsV1 = {
		customer_id: fullCustomer.id || fullCustomer.internal_id,
		entity_id: fullCustomer.entity?.id,
		plan_id: fullProduct.id,

		invoice_mode: attachParamsToInvoiceModeParams({ attachParams }),

		redirect_mode: "if_required",

		plan_schedule: planTiming,
		discounts: paramDiscounts,
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
