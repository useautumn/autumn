import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { StripeBillingPlanResult } from "@/internal/billing/v2/types/billingResult";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";

export const logStripeExecution = ({
	ctx,
	result,
	stage,
}: {
	ctx: AutumnContext;
	result: StripeBillingPlanResult;
	stage: "invoice" | "subscription" | "complete";
}) => {
	addToExtraLogs({
		ctx,
		extras: {
			stripeExecution: {
				stage,
				stripeSubscriptionId: result.stripeSubscription?.id ?? "undefined",
				stripeInvoiceId: result.stripeInvoice?.id ?? "undefined",
				stripeInvoiceStatus: result.stripeInvoice?.status ?? "undefined",
				requiredAction: result.requiredAction ?? "undefined",
				deferred: result.deferred ?? false,
			},
		},
	});
};
