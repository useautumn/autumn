import type { BillingVerifyExportRow } from "@autumn/shared";
import type Stripe from "stripe";

export const STRIPE_CUSTOMER_NOT_IN_AUTUMN = "stripe_customer_not_in_autumn";

/** Incomplete subs are abandoned checkouts and paused ones bill nothing, so
 * only subscriptions a customer is actually being billed on are reported. */
const BILLED_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
	"active",
	"trialing",
	"past_due",
	"unpaid",
]);

export const isBilledSubscription = (subscription: Stripe.Subscription) =>
	BILLED_SUBSCRIPTION_STATUSES.has(subscription.status);

export type OrphanedStripeCustomer = {
	stripeCustomerId: string;
	name: string | null;
	email: string | null;
	subscriptionIds: string[];
};

const ORPHAN_MESSAGE =
	"Stripe customer has a billed subscription but no Autumn customer is linked to it";

const LIST_SEPARATOR = ", ";

const possibleMatchSuffix = ({
	possibleMatchIds,
}: {
	possibleMatchIds: string[];
}) =>
	possibleMatchIds.length === 0
		? ""
		: `. Possible match (same email): Autumn customer ${possibleMatchIds.join(LIST_SEPARATOR)}`;

export const orphanToExportRow = ({
	orphan,
	possibleMatchIds,
}: {
	orphan: OrphanedStripeCustomer;
	possibleMatchIds: string[];
}): BillingVerifyExportRow => ({
	customer_id: null,
	name: orphan.name,
	email: orphan.email,
	stripe_customer_id: orphan.stripeCustomerId,
	stripe_subscription_ids: orphan.subscriptionIds.join(LIST_SEPARATOR),
	severity: "error",
	issues: STRIPE_CUSTOMER_NOT_IN_AUTUMN,
	details: `${STRIPE_CUSTOMER_NOT_IN_AUTUMN}: ${ORPHAN_MESSAGE}${possibleMatchSuffix({ possibleMatchIds })}`,
});

export const failedOrphanToExportRow = ({
	stripeCustomerId,
	error,
}: {
	stripeCustomerId: string;
	error: unknown;
}): BillingVerifyExportRow => ({
	customer_id: null,
	name: null,
	email: null,
	stripe_customer_id: stripeCustomerId,
	stripe_subscription_ids: null,
	severity: "error",
	issues: "verify_failed",
	details: error instanceof Error ? error.message : String(error),
});
