import { RecaseError, type StripeBillingPlan } from "@autumn/shared";
import {
	billingPlanWillCharge,
	getChargeReasonMessage,
} from "@/internal/billing/v2/utils/billingPlan/billingPlanWillCharge.js";

export type StripePlanNoChargesViolation = {
	message: string;
	details: Record<string, unknown>;
};

export const hasStripePlanActions = (stripeBillingPlan: StripeBillingPlan) =>
	Object.values(stripeBillingPlan).some((action) => action !== undefined);

const getStripePlanNoChargesViolation = ({
	stripeBillingPlan,
	subscriptionId,
}: {
	stripeBillingPlan: StripeBillingPlan;
	subscriptionId?: string;
}): StripePlanNoChargesViolation | undefined => {
	const details = subscriptionId ? { subscriptionId } : {};
	const chargeResult = billingPlanWillCharge({
		billingPlan: { stripe: stripeBillingPlan },
	});

	if (chargeResult.willCharge) {
		return {
			message: `Stripe billing plan will charge because ${getChargeReasonMessage(chargeResult.reason)}`,
			details,
		};
	}

	if (stripeBillingPlan.invoiceAction) {
		return {
			message: "Stripe billing plan produced an invoice action",
			details,
		};
	}

	if (stripeBillingPlan.refundAction) {
		return {
			message: "Stripe billing plan produced a refund action",
			details,
		};
	}

	const { subscriptionAction } = stripeBillingPlan;
	if (subscriptionAction?.type === "create") {
		return {
			message: "Stripe billing plan produced a subscription create action",
			details,
		};
	}

	if (
		subscriptionAction?.type === "update" &&
		subscriptionAction.params.proration_behavior !== "none"
	) {
		return {
			message:
				"Stripe billing plan produced a subscription update without proration_behavior: none",
			details,
		};
	}

	return undefined;
};

export const assertStripePlanNoCharges = ({
	stripeBillingPlan,
	subscriptionId,
	createError = (violation) =>
		new RecaseError({
			message: violation.message,
			data: violation.details,
		}),
}: {
	stripeBillingPlan: StripeBillingPlan;
	subscriptionId?: string;
	createError?: (violation: StripePlanNoChargesViolation) => Error;
}) => {
	const violation = getStripePlanNoChargesViolation({
		stripeBillingPlan,
		subscriptionId,
	});
	if (!violation) return;

	throw createError(violation);
};
