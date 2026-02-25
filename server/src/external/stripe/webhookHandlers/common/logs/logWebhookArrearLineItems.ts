import type { UpdateCustomerEntitlement } from "@autumn/shared";
import { formatMs, type LineItem } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
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
				lineItems: lineItems.map((item) => ({
					description: item.description,
					amount: item.amount,
					amountAfterDiscounts: item.amountAfterDiscounts,
					discountable: item.context.discountable ?? false,
				})),
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
