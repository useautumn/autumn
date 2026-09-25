import type {
	BillingPlan,
	CreateScheduleBillingContext,
	FullCusProduct,
	SetPlansPreviewResponse,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/createSchedule/compute/computeCreateSchedulePlan";
import { billingPlanToAttachPreview } from "@/internal/billing/v2/utils/billingPlan/billingPlanToAttachPreview";
import { getDeleteCustomerProducts } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import { buildSetPlansPreviewPhases } from "./buildSetPlansPreviewPhases";
import { setPlansPreviewToWarnings } from "./setPlansPreviewToWarnings";
import { stripeBillingPlanToProcessorChanges } from "./stripeBillingPlanToProcessorChanges";

export const buildSetPlansPreview = async ({
	ctx,
	billingContext,
	billingPlan,
	phases,
	outgoingCustomerProducts,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	billingPlan: BillingPlan;
	phases: SchedulePhasePlan[];
	outgoingCustomerProducts: FullCusProduct[];
}): Promise<SetPlansPreviewResponse> => {
	const attachPreview = await billingPlanToAttachPreview({
		ctx,
		billingContext,
		billingPlan,
	});
	const previewPhases = await buildSetPlansPreviewPhases({
		ctx,
		billingContext,
		billingPlan,
		phases,
	});
	const processorChanges = stripeBillingPlanToProcessorChanges({
		stripeBillingPlan: billingPlan.stripe,
		stripeSubscriptionSchedule: billingContext.stripeSubscriptionSchedule,
	});

	return {
		...attachPreview,
		phases: previewPhases,
		processor_changes: processorChanges,
		warnings: setPlansPreviewToWarnings({
			phases: previewPhases,
			processorChanges,
			deletedCustomerProducts: getDeleteCustomerProducts({
				autumnBillingPlan: billingPlan.autumn,
			}),
			outgoingCustomerProducts,
			requestedProrationBehavior: billingContext.requestedProrationBehavior,
		}),
	};
};
