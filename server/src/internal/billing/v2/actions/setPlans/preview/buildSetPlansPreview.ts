import type { SetPlansPreviewResponse } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getRequestedBillingCycleAnchorResetAt } from "@/internal/billing/v2/utils/billingContext/getRequestedBillingCycleAnchorResetAt";
import { billingPlanToAttachPreview } from "@/internal/billing/v2/utils/billingPlan/billingPlanToAttachPreview";
import type { SetPlansResult } from "../types/setPlansResult";
import { buildSetPlansPreviewPhases } from "./buildSetPlansPreviewPhases";
import { fetchPastDueOpenInvoices } from "./fetchPastDueOpenInvoices";
import { fetchReplacedSubscriptionPreviewInputs } from "./fetchReplacedSubscriptionPreviewInputs";
import { buildAutumnStripePriceIndex } from "./processorItems/buildAutumnStripePriceIndex";
import { buildStripePriceLookup } from "./processorItems/price/buildStripePriceLookup";
import { stripeSubscriptionToProcessorItems } from "./processorItems/stripeSubscriptionToProcessorItems";
import type { ProcessorItemContext } from "./processorItems/types/processorItemContext";
import { setPlansPreviewToWarnings } from "./setPlansPreviewToWarnings";
import { stripeBillingPlanToProcessorChanges } from "./stripeBillingPlanToProcessorChanges";

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
		timeline,
		schedulePlan: { phases, immediatePhaseTransition, customerProductChanges },
	} = result;

	const [
		attachPreview,
		stripePrices,
		replacedSubscriptionInputs,
		liveOpenInvoices,
	] = await Promise.all([
		billingPlanToAttachPreview({ ctx, billingContext, billingPlan }),
		buildStripePriceLookup({
			ctx,
			stripeBillingPlan: billingPlan.stripe,
			stripeSubscription: billingContext.stripeSubscription,
		}),
		fetchReplacedSubscriptionPreviewInputs({
			ctx,
			billingContext,
			outgoingCustomerProducts:
				immediatePhaseTransition.outgoingCustomerProducts,
		}),
		fetchPastDueOpenInvoices({ ctx, billingContext }),
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

	const { phases: previewPhases, review } = await buildSetPlansPreviewPhases({
		ctx,
		billingContext,
		billingPlan,
		phases,
		timeline,
		customerProductIdBySegmentId:
			customerProductChanges.customerProductIdBySegmentId,
		processorItemContext,
	});
	const processorChanges = stripeBillingPlanToProcessorChanges({
		stripeBillingPlan: billingPlan.stripe,
		stripeSubscriptionSchedule: billingContext.stripeSubscriptionSchedule,
	});

	return {
		...attachPreview,
		phases: previewPhases,
		removed_phases: review.removedPhases,
		processor_changes: processorChanges,
		warnings: setPlansPreviewToWarnings({
			phases: previewPhases,
			liveProcessorItems: stripeSubscriptionToProcessorItems({
				stripeSubscription: billingContext.stripeSubscription,
				context: processorItemContext,
			}),
			processorChanges,
			withdrawnCustomerProducts: review.withdrawnStarts,
			outgoingCustomerProducts:
				immediatePhaseTransition.outgoingCustomerProducts,
			requestedProrationBehavior: billingContext.requestedProrationBehavior,
			requestedAnchorResetMs: billingContext.stripeSubscription
				? getRequestedBillingCycleAnchorResetAt({
						requestedBillingCycleAnchor:
							billingContext.requestedBillingCycleAnchor,
					})
				: undefined,
			features: ctx.features,
			billingContext,
			stripeBillingPlan: billingPlan.stripe,
			...replacedSubscriptionInputs,
			liveOpenInvoices,
			stripeSubscriptionScope: billingContext.stripeSubscriptionScope,
		}),
	};
};
