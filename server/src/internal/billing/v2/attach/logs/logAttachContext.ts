import { formatMs } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { AttachBillingContext } from "@/internal/billing/v2/types";
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
		currentEpochMs,
		invoiceMode,
		stripeSubscription,
		stripeSubscriptionSchedule,
		isCustom,
	} = billingContext;

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

				timestamps: `Current: ${formatMs(currentEpochMs)}`,

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
			},
		},
	});
};
