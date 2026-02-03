import {
	type AttachBillingContext,
	BillingVersion,
	findMainScheduledCustomerProductByGroup,
	InternalError,
	type PlanTiming,
	secondsToMs,
	type TrialContext,
} from "@autumn/shared";
import { stripeSubscriptionToScheduleId } from "@/external/stripe/subscriptions/utils/convertStripeSubscription";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupAttachEndOfCycleMs } from "@/internal/billing/v2/actions/attach/setup/setupAttachEndOfCycleMs";
import { setupUpgradeDowngradeBillingContext } from "@/internal/billing/v2/actions/legacy/setup/setupUpgradeBillingContext";
import { setupUpdateSubscriptionTrialContext } from "@/internal/billing/v2/actions/updateSubscription/setup/setupUpdateSubscriptionTrialContext";
import { fetchStripeSubscriptionForBilling } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeSubscriptionForBilling";
import { fetchStripeSubscriptionScheduleForBilling } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeSubscriptionScheduleForBilling";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams";

export const attachParamsToAttachBillingContext = async ({
	ctx,
	attachParams,
	planTiming,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	planTiming: PlanTiming;
}): Promise<AttachBillingContext> => {
	if (attachParams.products.length !== 1) {
		throw new InternalError({ message: "attachParams.products.length !== 1" });
	}

	// Full product
	const fullProduct = {
		...attachParams.products[0],
		prices: attachParams.prices,
		entitlements: attachParams.entitlements,
	};

	const stripeSubscription = await fetchStripeSubscriptionForBilling({
		ctx,
		fullCus: attachParams.customer,
		product: fullProduct,
	});

	const stripeSubscriptionSchedule =
		await fetchStripeSubscriptionScheduleForBilling({
			ctx,
			fullCus: attachParams.customer,
			products: [fullProduct],
			subscriptionScheduleId: stripeSubscriptionToScheduleId({
				stripeSubscription,
			}),
		});

	const currentEpochMs = attachParams.now ?? Date.now();

	const billingCycleAnchorMs =
		secondsToMs(stripeSubscription?.billing_cycle_anchor) ?? "now";

	const resetCycleAnchorMs = billingCycleAnchorMs;

	const currentCustomerProduct = setupUpgradeDowngradeBillingContext({
		attachParams,
	});

	const scheduledCustomerProduct = findMainScheduledCustomerProductByGroup({
		fullCustomer: attachParams.customer,
		productGroup: fullProduct.group,
	});

	const endOfCycleMs = setupAttachEndOfCycleMs({
		planTiming,
		currentCustomerProduct,
		stripeSubscription,
		currentEpochMs,
	});

	const invoiceMode = attachParams.invoiceOnly
		? {
				finalizeInvoice: attachParams.finalizeInvoice ?? false,
				enableProductImmediately: true,
			}
		: undefined;

	const paramsFreeTrial = attachParams.freeTrial;
	let trialContext: TrialContext | undefined;
	if (paramsFreeTrial && !attachParams.config?.disableTrial) {
		trialContext = setupUpdateSubscriptionTrialContext({
			stripeSubscription,
			customerProduct: currentCustomerProduct,
			currentEpochMs,
			params: {
				free_trial: attachParams.freeTrial,
			},
			fullProduct,
		});
	}

	const billingContext: AttachBillingContext = {
		billingVersion: BillingVersion.V1,
		fullCustomer: attachParams.customer,
		fullProducts: [fullProduct],
		featureQuantities: attachParams.optionsList,
		trialContext,
		invoiceMode,

		// Timestamps
		currentEpochMs,
		billingCycleAnchorMs,
		resetCycleAnchorMs,

		// Stripe context
		stripeCustomer: attachParams.stripeCus!,
		stripeSubscription,
		stripeSubscriptionSchedule,
		paymentMethod: attachParams.paymentMethod ?? undefined,

		// Attach additional context
		attachProduct: fullProduct,
		planTiming,
		checkoutMode: null,
		currentCustomerProduct,
		scheduledCustomerProduct,
		endOfCycleMs,
	};

	return billingContext;
};
