import type {
	BillingPlan,
	CreateScheduleBillingContext,
	CreateScheduleParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { computeAttachPreviewBillingPlan } from "@/internal/billing/v2/utils/billingPlan/preview/computeAttachPreviewBillingPlan";
import {
	computeSetPlansPlan,
	type SetPlansPlanResult,
} from "../compute/computeSetPlansPlan";
import {
	handleSetPlansBillingPlanErrors,
	handleSetPlansComputeErrors,
	handleSetPlansErrors,
} from "../errors/handleSetPlansErrors";
import { setupSetPlansBillingContext } from "../setup/setupSetPlansBillingContext";
import { ensureFreePhaseStripeProducts } from "./ensureFreePhaseStripeProducts";

type PreparedSetPlans = {
	billingContext: CreateScheduleBillingContext;
	billingPlan: BillingPlan;
	phases: SetPlansPlanResult["phases"];
	immediatePhaseTransition: SetPlansPlanResult["immediatePhaseTransition"];
};

/** Setup, compute and evaluate a create_schedule call, checking errors between each step. */
export const prepareSetPlans = async ({
	ctx,
	params,
	preview,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
	preview: boolean;
}): Promise<PreparedSetPlans> => {
	const billingContext = await setupSetPlansBillingContext({
		ctx,
		params,
		preview,
	});

	await handleSetPlansErrors({ billingContext, preview });

	const { autumnBillingPlan, phases, immediatePhaseTransition } =
		computeSetPlansPlan({ ctx, billingContext });
	await handleSetPlansComputeErrors({
		ctx,
		billingContext,
		autumnBillingPlan,
		immediatePhaseTransition,
	});

	if (!preview) {
		await ensureFreePhaseStripeProducts({
			ctx,
			billingContext,
			autumnBillingPlan,
		});
	}

	const stripeBillingPlan = await evaluateStripeBillingPlan({
		ctx,
		billingContext,
		autumnBillingPlan,
		checkoutMode: billingContext.checkoutMode,
	});
	const billingPlan: BillingPlan = {
		autumn: autumnBillingPlan,
		stripe: stripeBillingPlan,
	};

	handleSetPlansBillingPlanErrors({ ctx, billingContext, billingPlan });

	if (preview) {
		billingPlan.preview = await computeAttachPreviewBillingPlan({
			ctx,
			billingContext,
			autumnBillingPlan,
		});
	}

	return { billingContext, billingPlan, phases, immediatePhaseTransition };
};
