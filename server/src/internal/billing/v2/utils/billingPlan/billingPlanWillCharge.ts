import type { BillingPlan } from "@autumn/shared";

export type ChargeReason =
	| "subscription_create"
	| "trial_ending"
	| "invoice_created";

export type BillingPlanChargeResult =
	| { willCharge: true; reason: ChargeReason }
	| { willCharge: false; reason: null };

/**
 * Determines if a billing plan will result in an immediate charge based on Stripe actions.
 */
export const billingPlanWillCharge = ({
	billingPlan,
}: {
	billingPlan: BillingPlan;
}): BillingPlanChargeResult => {
	const { subscriptionAction, invoiceAction } = billingPlan.stripe;

	// Creating a new subscription will charge
	if (subscriptionAction?.type === "create") {
		return { willCharge: true, reason: "subscription_create" };
	}

	// Invoice action with lines means a charge will occur
	if (invoiceAction && invoiceAction.addLineParams?.lines.length > 0) {
		return { willCharge: true, reason: "invoice_created" };
	}

	// Updating subscription with trial_end === "now" will charge
	if (subscriptionAction?.type === "update") {
		if (subscriptionAction.params.trial_end === "now") {
			return { willCharge: true, reason: "trial_ending" };
		}
	}

	return { willCharge: false, reason: null };
};

/** Maps charge reasons to human-readable messages */
export const getChargeReasonMessage = (reason: ChargeReason): string => {
	switch (reason) {
		case "subscription_create":
			return "creating a new subscription";
		case "trial_ending":
			return "ending a free trial";
		case "invoice_created":
			return "an invoice will be created";
	}
};
