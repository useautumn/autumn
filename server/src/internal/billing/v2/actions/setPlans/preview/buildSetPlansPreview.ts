import {
	customerProductHasActiveStatus,
	filterCustomerProductsByStripeSubscriptionId,
	type SetPlansPreviewResponse,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getRequestedBillingCycleAnchorResetAt } from "@/internal/billing/v2/utils/billingContext/getRequestedBillingCycleAnchorResetAt";
import { billingPlanToAttachPreview } from "@/internal/billing/v2/utils/billingPlan/billingPlanToAttachPreview";
import type { SetPlansResult } from "../types/setPlansResult";
import { isCustomerProductOnOtherSubscription } from "../utils/isCustomerProductOnOtherSubscription";
import { buildSetPlansPreviewPhases } from "./buildSetPlansPreviewPhases";
import { currentSubscriptionTerms } from "./currentSubscriptionTerms";
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
	// Stripe invoices each subscription on its own, so next_cycle covers only the one this request bills.
	const stripeSubscriptionId = billingContext.stripeSubscription?.id;

	const [
		attachPreview,
		stripePrices,
		replacedSubscriptionInputs,
		liveOpenInvoices,
		subscriptionTerms,
	] = await Promise.all([
		billingPlanToAttachPreview({
			ctx,
			billingContext,
			billingPlan,
			nextCycleCustomerProductFilter: stripeSubscriptionId
				? (customerProduct) =>
						!isCustomerProductOnOtherSubscription({
							customerProduct,
							stripeSubscriptionId,
						})
				: undefined,
		}),
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
			billedLineItems: billingPlan.autumn.lineItems ?? [],
		}),
		fetchPastDueOpenInvoices({ ctx, billingContext }),
		currentSubscriptionTerms({ ctx, billingContext }),
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
		org: ctx.org,
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
		...subscriptionTerms,
		phases: previewPhases,
		removed_phases: review.removedPhases,
		processor_changes: processorChanges,
		warnings: setPlansPreviewToWarnings({
			phases: previewPhases,
			liveProcessorItems: stripeSubscriptionToProcessorItems({
				stripeSubscription: billingContext.stripeSubscription,
				context: processorItemContext,
			}),
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
			lineItems: billingPlan.autumn.lineItems,
			stripeSubscriptionScope: billingContext.stripeSubscriptionScope,
			resetsCycleNow: billingContext.requestedBillingCycleAnchor === "now",
			prorationOverride: billingContext.prorationOverride,
			liveCustomerProducts: billingContext.stripeSubscription
				? filterCustomerProductsByStripeSubscriptionId({
						customerProducts: billingContext.fullCustomer.customer_products,
						stripeSubscriptionId: billingContext.stripeSubscription.id,
					}).filter(customerProductHasActiveStatus)
				: [],
		}),
	};
};
