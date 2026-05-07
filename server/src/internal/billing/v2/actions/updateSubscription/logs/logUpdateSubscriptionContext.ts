import type { UpdateSubscriptionBillingContext } from "@autumn/shared";
import { formatMs } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";

export const logUpdateSubscriptionContext = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
}) => {
	const {
		fullProducts,
		customerProduct,
		featureQuantities,
		currentEpochMs,
		billingCycleAnchorMs,
		resetCycleAnchorMs,
		trialContext,
		invoiceMode,
		stripeSubscription,
		stripeSubscriptionSchedule,
		isCustom,
		cancelAction,
	} = billingContext;

	const fullProduct = fullProducts[0];

	addToExtraLogs({
		ctx,
		extras: {
			billingContext: {
				intent: billingContext.intent,
				product: `${fullProduct?.id ?? "undefined"} (v${fullProduct?.version ?? "undefined"}) ${isCustom ? "custom" : "standard"}`,
				customerProduct: `${customerProduct.id}`,

				timestamps: `Reset: ${formatMs(resetCycleAnchorMs)} | Billing Anchor: ${billingCycleAnchorMs === "now" ? "now" : formatMs(billingCycleAnchorMs)} | Current: ${formatMs(currentEpochMs)}`,

				invoiceMode: invoiceMode
					? `enable immediately: ${invoiceMode.enableProductImmediately} | finalize invoice: ${invoiceMode.finalizeInvoice}`
					: "undefined",

				stripe: `${stripeSubscription?.id ?? "no sub"} | ${stripeSubscriptionSchedule?.id ?? "no schedule"}`,

				featureQuantities: featureQuantities
					.map(
						(featureQuantity) =>
							`${featureQuantity.feature_id}: ${featureQuantity.quantity}`,
					)
					.join(", "),

				trialContext: trialContext
					? `trial ends at: ${formatMs(trialContext.trialEndsAt)}, free trial ID: ${trialContext.freeTrial?.id ?? "undefined"}`
					: "undefined",

				defaultProduct: billingContext.defaultProduct?.name ?? "undefined",
				cancelAction: cancelAction ? cancelAction : "no cancel operation",
				skipBillingChanges: billingContext.skipBillingChanges,
				patchContext: billingContext.patchContext
					? `${billingContext.patchContext.mode} ${billingContext.patchContext.originalCustomerProduct.id} -> ${billingContext.patchContext.finalCustomerProduct.id} | +${billingContext.patchContext.customEntitlements.length} ent, +${billingContext.patchContext.customPrices.length} price | -${billingContext.patchContext.deleteCustomerEntitlements.length} ent, -${billingContext.patchContext.deleteCustomerPrices.length} price`
					: "none",

				anchorResetRefund: billingContext.anchorResetRefund
					? `noPartialRefund: ${billingContext.anchorResetRefund.noPartialRefund} | refundCycle: ${billingContext.anchorResetRefund.refundCycle ? `${billingContext.anchorResetRefund.refundCycle.interval} x${billingContext.anchorResetRefund.refundCycle.intervalCount}` : "none"}`
					: "none",
			},
		},
	});
};
