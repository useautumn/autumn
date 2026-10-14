import type { BillingPlan } from "@autumn/shared";

export type ChargeReason =
	| "subscription_create"
	| "trial_ending"
	| "invoice_created";

export type BillingPlanChargeResult =
	| { willCharge: true; reason: ChargeReason }
	| { willCharge: false; reason: null };

export const billingPlanWillCharge = ({
	billingPlan,
}: {
	billingPlan: Pick<BillingPlan, "stripe">;
}): BillingPlanChargeResult => {
	const { subscriptionAction, invoiceAction } = billingPlan.stripe;

	if (subscriptionAction?.type === "create") {
		return { willCharge: true, reason: "subscription_create" };
	}

	if (invoiceAction && invoiceAction.addLineParams?.lines.length > 0) {
		return { willCharge: true, reason: "invoice_created" };
	}

	if (subscriptionAction?.type === "update") {
		if (subscriptionAction.params.trial_end === "now") {
			return { willCharge: true, reason: "trial_ending" };
		}
	}

	return { willCharge: false, reason: null };
};

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
