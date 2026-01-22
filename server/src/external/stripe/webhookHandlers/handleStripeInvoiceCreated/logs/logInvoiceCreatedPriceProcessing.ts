import { type FullCusEntWithFullCusProduct, formatMs } from "@autumn/shared";
import type { StripeWebhookContext } from "@/external/stripe/webhookMiddlewares/stripeWebhookContext";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";

export const logPrepaidPriceProcessed = ({
	ctx,
	customerEntitlement,
	resetQuantity,
	newAllowance,
	nextResetAt,
}: {
	ctx: StripeWebhookContext;
	customerEntitlement: FullCusEntWithFullCusProduct;
	resetQuantity: number;
	newAllowance: number;
	nextResetAt: number;
}) => {
	addToExtraLogs({
		ctx,
		extras: {
			prepaidPriceProcessed: {
				featureId: customerEntitlement.entitlement.feature?.id,
				cusEntId: customerEntitlement.id,
				resetQuantity,
				newAllowance,
				nextResetAt: formatMs(nextResetAt),
			},
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
	addToExtraLogs({
		ctx,
		extras: {
			allocatedPriceProcessed: {
				featureId: customerEntitlement.entitlement.feature?.id,
				cusEntId: customerEntitlement.id,
				replaceablesRemoved,
				balanceIncremented,
			},
		},
	});
};
