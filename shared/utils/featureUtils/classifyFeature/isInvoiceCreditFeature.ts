import { FeatureType } from "../../../models/featureModels/featureEnums.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";

export const isInvoiceCreditFeature = ({
	feature,
}: {
	feature?: Feature;
}): boolean =>
	feature?.type === FeatureType.CreditSystem &&
	feature.config?.invoice_credit === true;

export const isEnablingInvoiceCreditFeature = ({
	currentFeature,
	nextFeature,
}: {
	currentFeature: Feature;
	nextFeature: Feature;
}): boolean =>
	!isInvoiceCreditFeature({ feature: currentFeature }) &&
	isInvoiceCreditFeature({ feature: nextFeature });
