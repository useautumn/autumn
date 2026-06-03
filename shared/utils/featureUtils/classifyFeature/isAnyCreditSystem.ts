import { FeatureType } from "@models/featureModels/featureEnums";

export const isAnyCreditSystem = (type: FeatureType): boolean =>
	type === FeatureType.CreditSystem || type === FeatureType.AiCreditSystem;
