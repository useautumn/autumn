import type {
	CreateScheduleParamsV0,
	SetPlansPreviewResponse,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { prepareCreateSchedule } from "@/internal/billing/v2/actions/createSchedule/utils/prepareCreateSchedule";
import { billingPlanToAttachPreview } from "@/internal/billing/v2/utils/billingPlan/billingPlanToAttachPreview";
import { getDeleteCustomerProducts } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import { buildSetPlansPreviewPhases } from "./preview/buildSetPlansPreviewPhases";
import { buildAutumnStripePriceIndex } from "./preview/processorItems/buildAutumnStripePriceIndex";
import { buildStripePriceLookup } from "./preview/processorItems/price/buildStripePriceLookup";
import { stripeSubscriptionToProcessorItems } from "./preview/processorItems/stripeSubscriptionToProcessorItems";
import type { ProcessorItemContext } from "./preview/processorItems/types/processorItemContext";
import { setPlansPreviewToWarnings } from "./preview/setPlansPreviewToWarnings";
import { stripeBillingPlanToProcessorChanges } from "./preview/stripeBillingPlanToProcessorChanges";

/** Preview the phase-by-phase Autumn and Stripe changes for a set_plans call. */
export const previewSetPlans = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateScheduleParamsV0;
}): Promise<SetPlansPreviewResponse> => {
	const { billingContext, billingPlan, phases, immediatePhaseTransition } =
		await prepareCreateSchedule({ ctx, params, preview: true });

	const [attachPreview, stripePrices] = await Promise.all([
		billingPlanToAttachPreview({ ctx, billingContext, billingPlan }),
		buildStripePriceLookup({
			ctx,
			stripeBillingPlan: billingPlan.stripe,
			stripeSubscription: billingContext.stripeSubscription,
		}),
	]);
	const processorItemContext: ProcessorItemContext = {
		priceIndex: buildAutumnStripePriceIndex({
			customerProducts: [
				...billingContext.fullCustomer.customer_products,
				...billingPlan.autumn.insertCustomerProducts,
			],
			features: ctx.features,
		}),
		stripePrices,
		currency: attachPreview.currency,
	};

	const previewPhases = await buildSetPlansPreviewPhases({
		ctx,
		billingContext,
		billingPlan,
		phases,
		processorItemContext,
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
			liveProcessorItems: stripeSubscriptionToProcessorItems({
				stripeSubscription: billingContext.stripeSubscription,
				context: processorItemContext,
			}),
			processorChanges,
			deletedCustomerProducts: getDeleteCustomerProducts({
				autumnBillingPlan: billingPlan.autumn,
			}),
			outgoingCustomerProducts:
				immediatePhaseTransition.outgoingCustomerProducts,
			requestedProrationBehavior: billingContext.requestedProrationBehavior,
			features: ctx.features,
		}),
	};
};
