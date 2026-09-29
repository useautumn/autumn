import {
	type AutumnBillingPlan,
	type BillingPlan,
	type CreateScheduleBillingContext,
	type CreateScheduleParamsV0,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { validateCustomerEntitlementBatchTransitions } from "@/internal/billing/v2/actions/batchTransition/errors/validateCustomerEntitlementBatchTransitions";
import { handleMultiAttachCurrencyErrors } from "@/internal/billing/v2/actions/multiAttach/errors/handleMultiAttachCurrencyErrors";
import { assertNoAmbiguousDroppedLicenses } from "@/internal/billing/v2/common/errors/assertNoAmbiguousDroppedLicenses";
import { handleProrationBehaviorErrors } from "@/internal/billing/v2/common/errors/handleBillingBehaviorErrors";
import { handleLicenseTransitionErrors } from "@/internal/billing/v2/common/errors/handleLicenseTransitionErrors";
import { matchCustomerLicenseSuccessors } from "@/internal/billing/v2/compute/customerLicenseTransitions/matchCustomerLicenseSuccessors";
import { pairCustomerProducts } from "@/internal/billing/v2/compute/pairCustomerProducts";
import { handleStripeBillingPlanErrors } from "@/internal/billing/v2/providers/stripe/errors/handleStripeBillingPlanErrors";
import { isRevertTrialContext } from "@/internal/billing/v2/setup/trialContext/isRevertTrialContext";
import type { ImmediatePhaseTransition } from "../compute/computeSetPlansPlan";
import { resolveUnscheduledProductContexts } from "../utils/unscheduledProductContexts";
import { handleFirstPhaseStartDateErrors } from "./handleFirstPhaseStartDateErrors";
import { handleFreePhaseStripeConnectionErrors } from "./handleFreePhaseStripeConnectionErrors";
import { handleSetPlansLicenseQuantityErrors } from "./handleSetPlansLicenseQuantityErrors";
import { handleSetPlansSubscriptionIdErrors } from "./handleSetPlansSubscriptionIdErrors";
import { handleStripeSchedulePhaseLimitErrors } from "./handleStripeSchedulePhaseLimitErrors";
import { validateSetPlansPhasePlans } from "./validateSetPlansPhasePlans";
import { validateUnscheduledPlanScopes } from "./validateUnscheduledPlanScopes";

export const handleSetPlansErrors = async ({
	ctx,
	billingContext,
	params,
	preview = false,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	params: Pick<CreateScheduleParamsV0, "currency">;
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
		scheduledPhaseContexts: billingContext.scheduledPhaseContexts,
	});

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

	handleFirstPhaseStartDateErrors({ billingContext, preview });
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
	await handleSetPlansSubscriptionIdErrors({ ctx, billingContext });
};

export const handleSetPlansComputeErrors = async ({
	ctx,
	billingContext,
	autumnBillingPlan,
	immediatePhaseTransition,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
	immediatePhaseTransition: ImmediatePhaseTransition;
}) => {
	handleFreePhaseStripeConnectionErrors({
		ctx,
		billingContext,
		autumnBillingPlan,
	});
	handleLicenseTransitionErrors({ autumnBillingPlan });

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
