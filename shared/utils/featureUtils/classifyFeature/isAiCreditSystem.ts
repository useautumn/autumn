import { FeatureType } from "@models/featureModels/featureEnums";

export const isAiCreditSystem = (
	type: FeatureType | undefined | null,
): boolean => type === FeatureType.AiCreditSystem;
