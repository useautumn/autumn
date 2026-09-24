import type {
	AutumnBillingPlan,
	BillingContext,
	BillingPlan,
	FullCustomer,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getStripeActiveSubscriptionSchedule } from "@/external/stripe/subscriptionSchedules/index";
import { stripeSubscriptionToScheduleId } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { evaluateStripeBillingPlan } from "@/internal/billing/v2/providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { CusService } from "@/internal/customers/CusService";
import { toLiveCustomerProductUpdate } from "./toLiveCustomerProductUpdate";

const toLiveAutumnBillingPlan = ({
	autumnBillingPlan,
	fullCustomer,
}: {
	autumnBillingPlan: AutumnBillingPlan;
	fullCustomer: FullCustomer;
}): AutumnBillingPlan => {
	const { updateCustomerProduct, updateCustomerProducts } = autumnBillingPlan;

	return {
		...autumnBillingPlan,
		updateCustomerProduct:
			updateCustomerProduct &&
			toLiveCustomerProductUpdate({
				update: updateCustomerProduct,
				fullCustomer,
			}),
		updateCustomerProducts: updateCustomerProducts?.flatMap(
			(update) => toLiveCustomerProductUpdate({ update, fullCustomer }) ?? [],
		),
	};
};

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

	const subscriptionScheduleId = stripeSubscriptionToScheduleId({
		stripeSubscription,
	});
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
 * The customer and subscription can change between invoice creation and payment, so the
 * subscription update is rebuilt from their live state rather than replayed from the snapshot.
 */
export const refreshDeferredBillingPlan = async ({
	ctx,
	billingPlan,
	billingContext,
}: {
	ctx: AutumnContext;
	billingPlan: BillingPlan;
	billingContext: BillingContext;
}): Promise<{ billingPlan: BillingPlan; billingContext: BillingContext }> => {
	const liveBillingContext = await fetchLiveBillingContext({
		ctx,
		billingContext,
	});

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
