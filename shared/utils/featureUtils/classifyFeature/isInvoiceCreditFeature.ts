import { FeatureType } from "../../../models/featureModels/featureEnums.js";
import type { Feature } from "../../../models/featureModels/featureModels.js";

export const isInvoiceCreditFeature = ({
	feature,
}: {
	feature?: Feature;
}): boolean =>
	feature?.type === FeatureType.CreditSystem &&
	feature.config?.invoice_credit === true;
