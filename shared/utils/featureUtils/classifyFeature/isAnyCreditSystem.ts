import { FeatureType } from "@models/featureModels/featureEnums";
import { isAiCreditSystem } from "@utils/featureUtils/classifyFeature/isAiCreditSystem";

export const isAnyCreditSystem = (
	type: FeatureType | undefined | null,
): boolean => type === FeatureType.CreditSystem || isAiCreditSystem(type);
