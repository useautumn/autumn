import type { MultiAttachBillingContext } from "@autumn/shared";
import type { setupScheduledProductsContext } from "./setupScheduledProductsContext";

/** Custom prices and entitlements of every phase, so later phases bill what was customised. */
export const mergeScheduledPhaseCustomizations = ({
	billingContext,
	scheduledPhaseContexts,
}: {
	billingContext: MultiAttachBillingContext;
	scheduledPhaseContexts: Awaited<
		ReturnType<typeof setupScheduledProductsContext>
	>;
}) => {
	const scheduledProductContexts = scheduledPhaseContexts.flatMap(
		(phase) => phase.productContexts,
	);
	const scheduledCustomPrices = scheduledProductContexts.flatMap(
		(productContext) => productContext.customPrices,
	);
	const scheduledCustomEntitlements = scheduledProductContexts.flatMap(
		(productContext) => productContext.customEntitlements,
	);

	return {
		customPrices: [
			...(billingContext.customPrices ?? []),
			...scheduledCustomPrices,
		],
		customEnts: [
			...(billingContext.customEnts ?? []),
			...scheduledCustomEntitlements,
		],
		isCustom:
			billingContext.isCustom ||
			scheduledCustomPrices.length > 0 ||
			scheduledCustomEntitlements.length > 0,
	};
};
