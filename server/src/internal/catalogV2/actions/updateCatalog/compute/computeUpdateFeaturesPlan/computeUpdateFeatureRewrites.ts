import { type Feature, FeatureType } from "@autumn/shared";
import type { FeatureState } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	FeatureRewritePlan,
	FeatureTypeRewrite,
	UpdateCreditSystemSchemaPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateFeaturePlan";

const emptyRewritePlan = (): FeatureRewritePlan => ({
	typeChange: null,
	idChange: null,
	usageTypeChange: null,
	updateCreditSystemSchemas: [],
});

/** Only boolean ↔ metered reshapes entitlements; other type pairs are no-ops here. */
const booleanMeteredTypeChange = ({
	current,
	next,
}: {
	current: Feature;
	next: Feature;
}): FeatureTypeRewrite | null => {
	if (
		current.type === FeatureType.Boolean &&
		next.type === FeatureType.Metered
	) {
		return "boolean_to_metered";
	}
	if (
		current.type === FeatureType.Metered &&
		next.type === FeatureType.Boolean
	) {
		return "metered_to_boolean";
	}
	return null;
};

/** Rewrite metered_feature_id in each credit system that references this feature. */
const renameFeatureIdInCreditSystemSchemas = ({
	fromId,
	toId,
	creditSystems,
	pendingCreditSystemConfigs,
}: {
	fromId: string;
	toId: string;
	creditSystems: Feature[];
	pendingCreditSystemConfigs: Map<string, Feature["config"]>;
}): UpdateCreditSystemSchemaPlan[] =>
	creditSystems.map((creditSystem) => {
		const baseConfig =
			pendingCreditSystemConfigs.get(creditSystem.id) ??
			structuredClone(creditSystem.config);
		const config = {
			...baseConfig,
			schema: (baseConfig?.schema ?? []).map(
				(entry: { metered_feature_id: string }) =>
					entry.metered_feature_id === fromId
						? { ...entry, metered_feature_id: toId }
						: entry,
			),
		};
		pendingCreditSystemConfigs.set(creditSystem.id, config);
		return { id: creditSystem.id, config };
	});

/** Declare reference-rewrite intents for one current → next feature update. */
export const computeUpdateFeatureRewrites = ({
	current,
	next,
	state,
	pendingCreditSystemConfigs,
}: {
	current: Feature;
	next: Feature;
	state: FeatureState | undefined;
	pendingCreditSystemConfigs: Map<string, Feature["config"]>;
}): FeatureRewritePlan => {
	const rewrites = emptyRewritePlan();

	if (next.type !== current.type) {
		rewrites.typeChange = booleanMeteredTypeChange({ current, next });
	}

	if (next.id !== current.id) {
		rewrites.idChange = { fromId: current.id, toId: next.id };
		rewrites.updateCreditSystemSchemas = renameFeatureIdInCreditSystemSchemas({
			fromId: current.id,
			toId: next.id,
			creditSystems: state?.creditSystems ?? [],
			pendingCreditSystemConfigs,
		});
	}

	const usageTypeChanged =
		current.type !== FeatureType.Boolean &&
		next.type !== FeatureType.Boolean &&
		current.config?.usage_type !== next.config?.usage_type;

	if (usageTypeChanged && next.config?.usage_type) {
		rewrites.usageTypeChange = { nextUsageType: next.config.usage_type };
	}

	return rewrites;
};
