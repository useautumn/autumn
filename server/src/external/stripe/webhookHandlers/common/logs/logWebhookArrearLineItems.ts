import { formatMs, type LineItem } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import type { UpdateCustomerEntitlement } from "@/internal/billing/v2/types/autumnBillingPlan";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";

export const logWebhookArrearLineItems = ({
	ctx,
	lineItems,
	updateCustomerEntitlements,
}: {
	ctx: StripeWebhookContext;
	lineItems: LineItem[];
	updateCustomerEntitlements: UpdateCustomerEntitlement[];
}) => {
	addToExtraLogs({
		ctx,
		extras: {
			arrearLineItems: {
				lineItems: lineItems.map(
					(item) => `${item.description}: ${item.finalAmount}`,
				),
				updateCustomerEntitlements: updateCustomerEntitlements.map(
					(update) => ({
						featureId: update.customerEntitlement.entitlement.feature?.id,
						...update.updates,
						next_reset_at: formatMs(update.updates?.next_reset_at),
					}),
				),
			},
		},
	});
};
