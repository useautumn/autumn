import { validateMeteredConfig } from "@/internal/features/featureUtils.js";
import { constructFeature } from "@/internal/features/utils/constructFeatureUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { keyToTitle } from "@/utils/genUtils.js";
import {
	AggregateType,
	AppEnv,
	ChatFeatureCreditSchema,
	ChatResultFeature,
	FeatureType,
	FeatureUsageType,
	MeteredConfig,
} from "@autumn/shared";
import { CreditSystemConfig } from "@autumn/shared";

const validateFeatures = (features: ChatResultFeature[]) => {
	features.forEach((feature) => {
		if (feature.type == "credit_system") {
			if (!feature.credit_schema) {
				throw new RecaseError({
					message: "Credit schema is required for credit system",
					code: "invalid_chat_feature",
					statusCode: 400,
				});
			} else {
				feature.credit_schema.forEach((item) => {
					if (!ChatFeatureCreditSchema.safeParse(item).success) {
						throw new RecaseError({
							message: "Invalid credit schema",
							code: "invalid_chat_feature",
							statusCode: 400,
						});
					}

					let meteredFeature = features.some(
						(m) => m.id == item.metered_feature_id && m.id != feature.id,
					);
					if (!meteredFeature) {
						throw new RecaseError({
							message: `Metered feature ${item.metered_feature_id} not found`,
							code: "invalid_chat_feature",
							statusCode: 400,
						});
					}
				});
			}
		}
	});
};

export const parseChatResultFeatures = ({
	features,
	orgId,
}: {
	features: ChatResultFeature[];
	orgId: string;
}) => {
	validateFeatures(features);

	return features.map((feature) => {
		let type =
			feature.type == "boolean"
				? FeatureType.Boolean
				: feature.type == "credit_system"
					? FeatureType.CreditSystem
					: FeatureType.Metered;

		let config: CreditSystemConfig | MeteredConfig | undefined = undefined;
		if (type == FeatureType.CreditSystem) {
			config = {
				schema: feature.credit_schema!.map((item) => ({
					feature_amount: 1,
					metered_feature_id: item.metered_feature_id,
					credit_amount: item.credit_cost,
				})),
				usage_type: FeatureUsageType.Single,
			};
		} else if (type == FeatureType.Metered) {
			config = validateMeteredConfig({
				usage_type: feature.type as FeatureUsageType,
				filters: [
					{
						property: "",
						operator: "",
						value: [],
					},
				],
				aggregate: { type: AggregateType.Sum, property: "value" },
			});
		}

		let backendFeat = constructFeature({
			id: feature.id,
			name: keyToTitle(feature.id),
			type,
			env: AppEnv.Sandbox,
			config,
			orgId: orgId,
			display: feature.display,
		});

		return backendFeat;
	});
};
