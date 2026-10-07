import {
	type DeferredAutumnBillingPlanData,
	type Metadata,
	MetadataType,
} from "@autumn/shared";

export type CheckoutActivation = "deferred" | "immediate";

/**
 * Whether a checkout's customer products wait for payment (pending rows promoted on
 * completion) or were granted up front (active rows linked on completion).
 */
export const checkoutMetadataToActivation = ({
	metadata,
}: {
	metadata: Pick<Metadata, "type" | "data">;
}): CheckoutActivation | undefined => {
	switch (metadata.type) {
		case MetadataType.CheckoutSessionV2:
			return "deferred";
		case MetadataType.CheckoutSessionEnabledImmediately:
			return "immediate";
		case MetadataType.LongLivedCheckout: {
			const { billingContext } = metadata.data as DeferredAutumnBillingPlanData;
			return billingContext.enablePlanImmediately ? "immediate" : "deferred";
		}
		default:
			return undefined;
	}
};
