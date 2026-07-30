import {
	type AutumnBillingPlan,
	type BillingPlan,
	type CreateScheduleBillingContext,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { handleUnsupportedLicenseActionErrors } from "@/internal/billing/v2/common/errors/handleUnsupportedLicenseActionErrors";
import { handleStripeBillingPlanErrors } from "@/internal/billing/v2/providers/stripe/errors/handleStripeBillingPlanErrors";
import {
	getDeleteCustomerProducts,
	getExpiredUpdatedCustomerProducts,
} from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
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

	if (billingContext.trialContext?.onEnd === "revert") {
		throw new RecaseError({
			code: ErrCode.InvalidRequest,
			message: "Cannot use on_end: 'revert' with create_schedule.",
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};

export const handleCreateScheduleComputeErrors = ({
	billingContext,
	autumnBillingPlan,
}: {
	billingContext: CreateScheduleBillingContext;
	autumnBillingPlan: AutumnBillingPlan;
}) => {
	const outgoingCustomerProducts = [
		...getExpiredUpdatedCustomerProducts({ autumnBillingPlan }),
		...getDeleteCustomerProducts({ autumnBillingPlan }),
	];
	handleUnsupportedLicenseActionErrors({
		actionLabel: "billing.create_schedule",
		fullProducts: [
			...billingContext.fullProducts,
			...billingContext.scheduledPhaseContexts.flatMap((phase) =>
				phase.productContexts.map(({ fullProduct }) => fullProduct),
			),
		],
		customerProducts: outgoingCustomerProducts,
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
