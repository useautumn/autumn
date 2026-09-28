import type {
	CreateScheduleParamsV0,
	SetPlansPreviewResponse,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { prepareCreateSchedulePreview } from "@/internal/billing/v2/actions/createSchedule/utils/prepareCreateSchedulePreview";
import { buildSetPlansPreview } from "./preview/buildSetPlansPreview";

/** Preview the phase-by-phase Autumn and Stripe changes for a set_plans call. */
export const previewSetPlans = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
}): Promise<SetPlansPreviewResponse> => {
	const { billingContext, billingPlan, phases, immediatePhaseTransition } =
		await prepareCreateSchedulePreview({ ctx, params });

	return buildSetPlansPreview({
		ctx,
		billingContext,
		billingPlan,
		phases,
		outgoingCustomerProducts: immediatePhaseTransition.outgoingCustomerProducts,
	});
};
