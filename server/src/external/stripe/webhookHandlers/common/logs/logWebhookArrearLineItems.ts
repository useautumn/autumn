import type { UpdateCustomerEntitlement } from "@autumn/shared";
import { formatMs, type LineItem } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";

const toLineItemLog = (item: LineItem) => ({
	featureId: item.context.feature?.id,
	entityId: item.context.entity?.id,
	description: item.description,
	amount: item.amount,
	amountAfterDiscounts: item.amountAfterDiscounts,
	discountable: item.context.discountable ?? false,
});

export const logWebhookArrearLineItems = ({
	ctx,
	lineItems,
	skippedLineItems = [],
	updateCustomerEntitlements,
}: {
	ctx: StripeWebhookContext;
	lineItems: LineItem[];
	/** Excluded from billing by a skip_overage_billing spend limit. */
	skippedLineItems?: LineItem[];
	updateCustomerEntitlements: UpdateCustomerEntitlement[];
}) => {
	addToExtraLogs({
		ctx,
		extras: {
			arrearLineItems: {
				lineItems: lineItems.map(toLineItemLog),
				...(skippedLineItems.length > 0 && {
					skippedOverageLineItems: skippedLineItems.map(toLineItemLog),
				}),
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
