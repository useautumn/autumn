import type { SetPlansPreviewResponse } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingPlanToAttachPreview } from "@/internal/billing/v2/utils/billingPlan/billingPlanToAttachPreview";
import { getDeleteCustomerProducts } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import type { SetPlansResult } from "../types/setPlansResult";
import { buildSetPlansPreviewPhases } from "./buildSetPlansPreviewPhases";
import { buildAutumnStripePriceIndex } from "./processorItems/buildAutumnStripePriceIndex";
import { buildStripePriceLookup } from "./processorItems/price/buildStripePriceLookup";
import { stripeSubscriptionToProcessorItems } from "./processorItems/stripeSubscriptionToProcessorItems";
import type { ProcessorItemContext } from "./processorItems/types/processorItemContext";
import { setPlansPreviewToWarnings } from "./setPlansPreviewToWarnings";
import { stripeBillingPlanToProcessorChanges } from "./stripeBillingPlanToProcessorChanges";

/** Format a set_plans preview result as the phase-by-phase Autumn and Stripe changes. */
export const buildSetPlansPreview = async ({
	ctx,
	result,
}: {
	ctx: AutumnContext;
	result: SetPlansResult;
}): Promise<SetPlansPreviewResponse> => {
	const {
		billingContext,
		billingPlan,
		schedulePlan: { phases, immediatePhaseTransition },
	} = result;

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
