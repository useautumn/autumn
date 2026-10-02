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
