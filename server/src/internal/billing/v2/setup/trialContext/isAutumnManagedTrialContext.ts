import type { InvoiceMode, TrialContext } from "@autumn/shared";
import type Stripe from "stripe";
import { isRevertTrialContext } from "./isRevertTrialContext";

const isNoCardTrialWithoutSubscription = ({
	trialContext,
	invoiceMode,
	stripeSubscription,
}: {
	trialContext?: TrialContext;
	invoiceMode?: InvoiceMode;
	stripeSubscription?: Stripe.Subscription;
}) =>
	trialContext?.cardRequired === false &&
	trialContext.appliesToBilling &&
	trialContext.trialEndsAt !== null &&
	!invoiceMode &&
	!stripeSubscription;

/** Trials Autumn runs without touching Stripe; the product cron settles them at trial end. */
export const isAutumnManagedTrialContext = ({
	trialContext,
	invoiceMode,
	stripeSubscription,
}: {
	trialContext?: TrialContext;
	invoiceMode?: InvoiceMode;
	stripeSubscription?: Stripe.Subscription;
}) =>
	isRevertTrialContext({ trialContext }) ||
	isNoCardTrialWithoutSubscription({
		trialContext,
		invoiceMode,
		stripeSubscription,
	});

/** Records on the trial context that Autumn settles its end, unless billing is already switched off for the request. */
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
	if (
		!isAutumnManagedTrialContext({
			trialContext,
			invoiceMode,
			stripeSubscription,
		})
	)
		return trialContext;
	return { ...trialContext, autumnManaged: true };
};
