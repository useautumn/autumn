import {
	type AutumnBillingPlan,
	type BillingPlan,
	type CreateScheduleBillingContext,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { validateCustomerEntitlementBatchTransitions } from "@/internal/billing/v2/actions/batchTransition/errors/validateCustomerEntitlementBatchTransitions";
import { assertNoAmbiguousDroppedLicenses } from "@/internal/billing/v2/common/errors/assertNoAmbiguousDroppedLicenses";
import { handleLicenseTransitionErrors } from "@/internal/billing/v2/common/errors/handleLicenseTransitionErrors";
import { matchCustomerLicenseSuccessors } from "@/internal/billing/v2/compute/customerLicenseTransitions/matchCustomerLicenseSuccessors";
import { pairCustomerProducts } from "@/internal/billing/v2/compute/pairCustomerProducts";
import { handleStripeBillingPlanErrors } from "@/internal/billing/v2/providers/stripe/errors/handleStripeBillingPlanErrors";
import { isRevertTrialContext } from "@/internal/billing/v2/setup/trialContext/isRevertTrialContext";
import type { ImmediatePhaseTransition } from "../compute/computeCreateSchedulePlan";
import { handleFirstPhaseStartDateErrors } from "./handleFirstPhaseStartDateErrors";

export const handleCreateScheduleErrors = async ({
	billingContext,
	preview = false,
}: {
	billingContext: CreateScheduleBillingContext;
	preview?: boolean;
}) => {
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

	if (isRevertTrialContext({ trialContext: billingContext.trialContext })) {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message: "Cannot use on_end: 'revert' with create_schedule.",
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};

export const handleCreateScheduleComputeErrors = async ({
	ctx,
	autumnBillingPlan,
	immediatePhaseTransition,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
	immediatePhaseTransition: ImmediatePhaseTransition;
}) => {
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

export const handleCreateScheduleBillingPlanErrors = ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	billingPlan: BillingPlan;
}) => {
	handleStripeBillingPlanErrors({ ctx, billingContext, billingPlan });
};
