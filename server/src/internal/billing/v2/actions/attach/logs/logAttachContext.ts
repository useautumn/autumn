import type { AttachBillingContext } from "@autumn/shared";
import { formatMs } from "@autumn/shared";
import { trace } from "@opentelemetry/api";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";

export const logAttachContext = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: AttachBillingContext;
}) => {
	const {
		attachProduct,
		currentCustomerProduct,
		scheduledCustomerProduct,
		planTiming,
		endOfCycleMs,
		checkoutMode,
		featureQuantities,
		transitionConfig,
		currentEpochMs,
		invoiceMode,
		stripeSubscription,
		stripeSubscriptionSchedule,
		isCustom,
		billingCycleAnchorMs,
		resetCycleAnchorMs,
		trialContext,
	} = billingContext;

	trace.getActiveSpan()?.setAttributes({
		"billing.action": "attach",
		"billing.plan_id": attachProduct.id,
		"billing.plan_version": attachProduct.version,
		"billing.from_plan_id": currentCustomerProduct?.product.id,
		"billing.plan_timing": planTiming,
		"billing.checkout_mode": checkoutMode ?? undefined,
		"billing.no_billing_changes": billingContext.skipBillingChanges,
	});

	addToExtraLogs({
		ctx,
		extras: {
			attachContext: {
				product: `${attachProduct.id} (v${attachProduct.version}) ${isCustom ? "custom" : "standard"}`,

				transition: currentCustomerProduct
					? `${currentCustomerProduct.product.id} -> ${attachProduct.id} (${planTiming})`
					: "new attachment",

				currentCustomerProduct: currentCustomerProduct?.id ?? "none",
				scheduledCustomerProduct: scheduledCustomerProduct?.id ?? "none",

				planTiming,
				endOfCycleMs: endOfCycleMs ? formatMs(endOfCycleMs) : "n/a",
				checkoutMode: checkoutMode ?? "direct billing",

				timestamps: `Current: ${formatMs(currentEpochMs)} | Billing Anchor: ${billingCycleAnchorMs === "now" ? "now" : formatMs(billingCycleAnchorMs)} | Reset: ${formatMs(resetCycleAnchorMs)}`,

				invoiceMode: invoiceMode
					? `enable immediately: ${invoiceMode.enableProductImmediately} | finalize invoice: ${invoiceMode.finalizeInvoice}`
					: "default",

				stripe: `${stripeSubscription?.id ?? "no sub"} | ${stripeSubscriptionSchedule?.id ?? "no schedule"}`,

				featureQuantities:
					featureQuantities.length > 0
						? featureQuantities
								.map((fq) => `${fq.feature_id}: ${fq.quantity}`)
								.join(", ")
						: "none",

				resetAfterTrialEndFeatureIds:
					transitionConfig?.resetAfterTrialEndFeatureIds
						? transitionConfig.resetAfterTrialEndFeatureIds.join(", ")
						: "none",

				trialContext: trialContext
					? `trial ends at: ${formatMs(trialContext.trialEndsAt)} | free trial ID: ${trialContext.freeTrial?.id ?? "none"} | appliesToBilling: ${trialContext.appliesToBilling}`
					: "none",

				anchorResetRefund: billingContext.anchorResetRefund
					? `noPartialRefund: ${billingContext.anchorResetRefund.noPartialRefund} | refundCycle: ${billingContext.anchorResetRefund.refundCycle ? `${billingContext.anchorResetRefund.refundCycle.interval} x${billingContext.anchorResetRefund.refundCycle.intervalCount}` : "none"}`
					: "none",
			},
		},
	});
};
