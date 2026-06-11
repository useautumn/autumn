import type {
	CreditSystemConfig,
	ProviderMarkups,
} from "../../models/featureModels/featureConfig/creditConfig.js";
import { FeatureUsageType } from "../../models/featureModels/featureEnums.js";

/** Single factory for the AiCreditSystem `config` shape. Callers pass already-resolved markup values; no fallback resolution happens here. */
export const buildAiCreditSystemConfig = (args: {
	defaultMarkup?: number | null;
	providerMarkups?: ProviderMarkups;
}): CreditSystemConfig => ({
	schema: [],
	usage_type: FeatureUsageType.Single,
	default_markup: args.defaultMarkup ?? undefined,
	provider_markups: args.providerMarkups,
});
