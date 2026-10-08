import {
	type AutumnBillingPlan,
	acceptsCarryOverUsages,
	type BillingPlan,
	type CreateScheduleBillingContext,
	ErrCode,
	RecaseError,
	type SetPlansParamsV0,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { validateCustomerEntitlementBatchTransitions } from "@/internal/billing/v2/actions/batchTransition/errors/validateCustomerEntitlementBatchTransitions";
import { handleMultiAttachCurrencyErrors } from "@/internal/billing/v2/actions/multiAttach/errors/handleMultiAttachCurrencyErrors";
import { assertNoAmbiguousDroppedLicenses } from "@/internal/billing/v2/common/errors/assertNoAmbiguousDroppedLicenses";
import { handleProrationBehaviorErrors } from "@/internal/billing/v2/common/errors/handleBillingBehaviorErrors";
import { handleCarryOverUsagesErrors } from "@/internal/billing/v2/common/errors/handleCarryOverUsagesErrors";
import { handleLicenseTransitionErrors } from "@/internal/billing/v2/common/errors/handleLicenseTransitionErrors";
import { matchCustomerLicenseSuccessors } from "@/internal/billing/v2/compute/customerLicenseTransitions/matchCustomerLicenseSuccessors";
import { pairCustomerProducts } from "@/internal/billing/v2/compute/pairCustomerProducts";
import { handleStripeBillingPlanErrors } from "@/internal/billing/v2/providers/stripe/errors/handleStripeBillingPlanErrors";
import { isRevertTrialContext } from "@/internal/billing/v2/setup/trialContext/isRevertTrialContext";
import type { ImmediatePhaseTransition } from "../compute/computeSetPlansPlan";
import type { SetPlansTimeline } from "../types/setPlansTimeline";
import { endsLiveTrial } from "../utils/endsLiveTrial";
import {
	resolvePhaseProductContexts,
	resolveUnscheduledProductContexts,
} from "../utils/unscheduledProductContexts";
import { handleFirstPhaseStartDateErrors } from "./handleFirstPhaseStartDateErrors";
import { handleFreePhaseStripeConnectionErrors } from "./handleFreePhaseStripeConnectionErrors";
import { handleFutureStartActivationErrors } from "./handleFutureStartActivationErrors";
import { handleKeptTrialAnchorErrors } from "./handleKeptTrialAnchorErrors";
import { handleSetPlansBillingCycleAnchorErrors } from "./handleSetPlansBillingCycleAnchorErrors";
import { handleSetPlansEndDateErrors } from "./handleSetPlansEndDateErrors";
import { handleSetPlansLicenseQuantityErrors } from "./handleSetPlansLicenseQuantityErrors";
import { handleSetPlansSubscriptionIdErrors } from "./handleSetPlansSubscriptionIdErrors";
import { handleStripeSchedulePhaseLimitErrors } from "./handleStripeSchedulePhaseLimitErrors";
import { handleTrialingCycleResetErrors } from "./handleTrialingCycleResetErrors";
import { assertNoBillingIntervalMix } from "./subscriptionScope/assertNoBillingIntervalMix";
import { handleStripeSubscriptionScopeErrors } from "./subscriptionScope/handleStripeSubscriptionScopeErrors";
import { validateSetPlansPhasePlans } from "./validateSetPlansPhasePlans";
import { validateUnscheduledPlanScopes } from "./validateUnscheduledPlanScopes";

export const handleSetPlansErrors = async ({
	ctx,
	billingContext,
	timeline,
	params,
	preview = false,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	timeline: SetPlansTimeline;
	params: Pick<SetPlansParamsV0, "currency" | "ends_at">;
	preview?: boolean;
}) => {
	validateSetPlansPhasePlans({
		plans: billingContext.productContexts.map((productContext) => ({
			fullProduct: productContext.fullProduct,
			scopeId: productContext.fullCustomer.entity?.internal_id,
		})),
	});
	validateUnscheduledPlanScopes({
		unscheduledProductContexts: resolveUnscheduledProductContexts({
			productContexts: billingContext.productContexts,
		}),
		openingPhaseProductContexts: resolvePhaseProductContexts({
			productContexts: billingContext.productContexts,
		}),
		scheduledPhaseContexts: billingContext.scheduledPhaseContexts,
	});
	handleStripeSubscriptionScopeErrors({ billingContext });

	if (
		billingContext.checkoutMode === "stripe_checkout" &&
		billingContext.enablePlanImmediately &&
		(billingContext.adjustableFeatureQuantities?.length ?? 0) > 0
	) {
		throw new RecaseError({
			message:
				"enable_plan_immediately cannot be used with adjustable feature quantities — set adjustable_quantity to false on each option, or remove enable_plan_immediately.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	handleFirstPhaseStartDateErrors({ billingContext, timeline, preview });
	handleKeptTrialAnchorErrors({ billingContext });
	handleTrialingCycleResetErrors({ billingContext });
	handleSetPlansBillingCycleAnchorErrors({
		billingContext,
		endsAt: params.ends_at,
	});
	handleSetPlansEndDateErrors({ billingContext, endsAt: params.ends_at });
	handleSetPlansLicenseQuantityErrors({ billingContext });

	if (isRevertTrialContext({ trialContext: billingContext.trialContext })) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message: "Cannot use on_end: 'revert' with create_schedule.",
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	handleMultiAttachCurrencyErrors({
		ctx,
		billingContext,
		params,
		fullProducts: [
			...billingContext.fullProducts,
			...billingContext.scheduledPhaseContexts.flatMap(({ productContexts }) =>
				productContexts.map(({ fullProduct }) => fullProduct),
			),
		],
	});
	await handleSetPlansSubscriptionIdErrors({ ctx, billingContext, timeline });
};

export const handleSetPlansComputeErrors = async ({
	ctx,
	billingContext,
	params,
	autumnBillingPlan,
	immediatePhaseTransition,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	params: Pick<SetPlansParamsV0, "carry_over_usages">;
	autumnBillingPlan: AutumnBillingPlan;
	immediatePhaseTransition: ImmediatePhaseTransition;
}) => {
	// Only an explicit request is rejected; an org transition rule simply has nothing to carry.
	handleCarryOverUsagesErrors({
		ctx,
		carryOverUsages: params.carry_over_usages,
		replacesPlanNow: acceptsCarryOverUsages({
			replacesPlanNow:
				immediatePhaseTransition.replacedCustomerProducts.length > 0,
			resetsCycleNow: billingContext.requestedBillingCycleAnchor === "now",
			endsTrialNow: endsLiveTrial({ billingContext }),
		}),
	});
	handleFutureStartActivationErrors({ billingContext, autumnBillingPlan });
	handleFreePhaseStripeConnectionErrors({
		ctx,
		billingContext,
		autumnBillingPlan,
	});
	handleLicenseTransitionErrors({ autumnBillingPlan });
	assertNoBillingIntervalMix({
		stripeSubscriptionScope: billingContext.stripeSubscriptionScope,
		currentCustomerProducts: billingContext.fullCustomer.customer_products,
		outgoingCustomerProducts: immediatePhaseTransition.outgoingCustomerProducts,
		incomingCustomerProducts: immediatePhaseTransition.incomingCustomerProducts,
	});

	const customerProductPairs = pairCustomerProducts(immediatePhaseTransition);
	for (const {
		outgoingCustomerProduct,
		incomingCustomerProduct,
	} of customerProductPairs) {
		const { unmatched } = matchCustomerLicenseSuccessors({
			outgoingCustomerLicenses: outgoingCustomerProduct.customer_licenses ?? [],
			incomingCustomerLicenses: incomingCustomerProduct.customer_licenses ?? [],
		});
		assertNoAmbiguousDroppedLicenses({ unmatched });
	}

	// Preflight the batch-transition limit, so an oversized pool fails before
	// Stripe and customer product writes begin.
	await validateCustomerEntitlementBatchTransitions({
		ctx,
		transitions: autumnBillingPlan.customerLicenseTransitions,
	});
};

export const handleSetPlansBillingPlanErrors = ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	billingPlan: BillingPlan;
}) => {
	handleProrationBehaviorErrors({ billingContext, billingPlan });
	handleStripeSchedulePhaseLimitErrors({ billingPlan });
	handleStripeBillingPlanErrors({ ctx, billingContext, billingPlan });
};
