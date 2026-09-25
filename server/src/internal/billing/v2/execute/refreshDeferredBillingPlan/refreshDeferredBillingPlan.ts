import {
	type BillingContext,
	type BillingPlan,
	type DeferredAutumnBillingPlanData,
	StripeBillingStage,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getStripeActiveSubscriptionSchedule } from "@/external/stripe/subscriptionSchedules/index";
import { stripeSubscriptionToScheduleId } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { CusService } from "@/internal/customers/CusService";
import { isDeferredSnapshotStale } from "./isDeferredSnapshotStale";
import { toLiveAutumnBillingPlan } from "./toLiveAutumnBillingPlan";

const fetchLiveBillingContext = async ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
}): Promise<BillingContext> => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: billingContext.fullCustomer.internal_id,
		withEntities: true,
	});

	const stripeSubscriptionId = billingContext.stripeSubscription?.id;
	const stripeSubscription = stripeSubscriptionId
		? await stripeCli.subscriptions.retrieve(stripeSubscriptionId, {
				expand: ["discounts.source.coupon.applies_to"],
			})
		: undefined;

	// A standalone (future-start) schedule is not on the subscription, so fall back to the snapshot's
	const subscriptionScheduleId =
		stripeSubscriptionToScheduleId({ stripeSubscription }) ??
		billingContext.stripeSubscriptionSchedule?.id;
	const stripeSubscriptionSchedule = subscriptionScheduleId
		? await getStripeActiveSubscriptionSchedule({
				stripeClient: stripeCli,
				subscriptionScheduleId,
			})
		: undefined;

	return {
		...billingContext,
		fullCustomer,
		stripeSubscription,
		stripeSubscriptionSchedule,
	};
};

/**
 * If the customer or subscription changed between invoice creation and payment, the subscription
 * update is rebuilt from their live state; otherwise the snapshot is replayed unchanged.
 */
export const refreshDeferredBillingPlan = async ({
	ctx,
	deferredData,
}: {
	ctx: AutumnContext;
	deferredData: DeferredAutumnBillingPlanData;
}): Promise<{ billingPlan: BillingPlan; billingContext: BillingContext }> => {
	const { billingPlan, billingContext, resumeAfter } = deferredData;

	// Past the invoice action the subscription was already updated, so there is nothing to rebuild
	const subscriptionNotYetUpdated =
		resumeAfter === StripeBillingStage.InvoiceAction;
	if (!subscriptionNotYetUpdated) return { billingPlan, billingContext };

	const liveBillingContext = await fetchLiveBillingContext({
		ctx,
		billingContext,
	});

	const snapshotIsStale = isDeferredSnapshotStale({
		billingPlan,
		fullCustomer: liveBillingContext.fullCustomer,
		stripeSubscription: liveBillingContext.stripeSubscription,
		stripeSubscriptionSchedule: liveBillingContext.stripeSubscriptionSchedule,
	});
	if (!snapshotIsStale) return { billingPlan, billingContext };

	const liveAutumnBillingPlan = toLiveAutumnBillingPlan({
		autumnBillingPlan: billingPlan.autumn,
		fullCustomer: liveBillingContext.fullCustomer,
	});

	const liveStripeBillingPlan = await evaluateStripeBillingPlan({
		ctx,
		billingContext: liveBillingContext,
		autumnBillingPlan: liveAutumnBillingPlan,
	});

	return {
		billingContext: liveBillingContext,
		billingPlan: {
			autumn: liveAutumnBillingPlan,
			stripe: {
				...billingPlan.stripe,
				subscriptionAction: liveStripeBillingPlan.subscriptionAction,
				subscriptionScheduleAction:
					liveStripeBillingPlan.subscriptionScheduleAction,
			},
		},
	};
};
