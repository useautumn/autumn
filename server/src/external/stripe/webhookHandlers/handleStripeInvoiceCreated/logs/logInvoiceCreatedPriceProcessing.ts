import { type FullCusEntWithFullCusProduct, formatMs } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { appendToExtraLogs } from "@/utils/logging/addToExtraLogs";

export const logPrepaidPriceProcessed = ({
	ctx,
	customerEntitlement,
	previousQuantity,
	resetQuantity,
	newAllowance,
	nextResetAt,
}: {
	ctx: StripeWebhookContext;
	customerEntitlement: FullCusEntWithFullCusProduct;
	previousQuantity: number;
	resetQuantity: number;
	newAllowance: number;
	nextResetAt: number;
}) => {
	appendToExtraLogs({
		ctx,
		key: "prepaidPricesProcessed",
		value: {
			featureId: customerEntitlement.entitlement.feature?.id,
			cusEntId: customerEntitlement.id,
			previousQuantity,
			resetQuantity,
			newAllowance,
			nextResetAt: formatMs(nextResetAt),
		},
	});
};

export const logAllocatedPriceProcessed = ({
	ctx,
	customerEntitlement,
	replaceablesRemoved,
	balanceIncremented,
}: {
	ctx: StripeWebhookContext;
	customerEntitlement: FullCusEntWithFullCusProduct;
	replaceablesRemoved: number;
	balanceIncremented: number;
}) => {
	appendToExtraLogs({
		ctx,
		key: "allocatedPricesProcessed",
		value: {
			featureId: customerEntitlement.entitlement.feature?.id,
			cusEntId: customerEntitlement.id,
			replaceablesRemoved,
			balanceIncremented,
		},
	});
};
