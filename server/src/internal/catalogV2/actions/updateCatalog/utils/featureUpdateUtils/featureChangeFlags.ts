import { type Feature, FeatureType } from "@autumn/shared";
import { isEnablingInvoiceCreditFeature } from "@/internal/features/creditSystemUtils.js";

/** Which blockable dimensions a resolved current → next update touches. */
export const featureChangeFlags = ({
	current,
	next,
}: {
	current: Feature;
	next: Feature;
}) => ({
	isChangingId: next.id !== current.id,
	isChangingType: next.type !== current.type,
	isChangingUsageType:
		current.type !== FeatureType.Boolean &&
		next.type !== FeatureType.Boolean &&
		current.config?.usage_type !== next.config?.usage_type,
	isEnablingInvoiceCredits: isEnablingInvoiceCreditFeature({
		currentFeature: current,
		nextFeature: next,
	}),
});
