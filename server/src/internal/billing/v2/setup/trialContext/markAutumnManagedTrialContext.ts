import type { InvoiceMode, TrialContext } from "@autumn/shared";
import type Stripe from "stripe";
import { isRevertTrialContext } from "./isRevertTrialContext";

const isNoCardTrialWithoutSubscription = ({
	trialContext,
	invoiceMode,
	stripeSubscription,
}: {
	trialContext: TrialContext;
	invoiceMode?: InvoiceMode;
	stripeSubscription?: Stripe.Subscription;
}) =>
	trialContext.cardRequired === false &&
	trialContext.appliesToBilling &&
	trialContext.trialEndsAt !== null &&
	!invoiceMode &&
	!stripeSubscription;

/** Marks trials Autumn settles itself (revert, or no-card without a subscription), unless billing is already off. */
export const markAutumnManagedTrialContext = ({
	trialContext,
	invoiceMode,
	stripeSubscription,
	skipBillingChangesBase,
}: {
	trialContext?: TrialContext;
	invoiceMode?: InvoiceMode;
	stripeSubscription?: Stripe.Subscription;
	skipBillingChangesBase: boolean;
}): TrialContext | undefined => {
	if (!trialContext || skipBillingChangesBase) return trialContext;

	const isAutumnManaged =
		isRevertTrialContext({ trialContext }) ||
		isNoCardTrialWithoutSubscription({
			trialContext,
			invoiceMode,
			stripeSubscription,
		});

	return isAutumnManaged
		? { ...trialContext, autumnManaged: true }
		: trialContext;
};
