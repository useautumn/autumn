import type { Feature, UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { featureUpdateCanRewriteReferences } from "@/internal/catalogV2/actions/updateCatalog/utils/featureUpdateUtils/featureUpdateCanRewriteReferences";
import { paramsToTouchedFeatures } from "@/internal/catalogV2/actions/updateCatalog/utils/featureUpdateUtils/paramsToTouchedFeatures";
import type {
	FeatureState,
	UpdateCatalogContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { getCreditSystemsFromFeature } from "@/internal/features/creditSystemUtils.js";
import { listFeatureStates } from "@/internal/features/repos/listFeatureStates.js";

const emptyFeatureState = ({
	creditSystems,
}: {
	creditSystems: Feature[];
}): FeatureState => ({
	has_customers: false,
	has_entitlements: false,
	has_loose_entitlements: false,
	has_entity_feature_entitlements: false,
	has_loose_entity_feature_entitlements: false,
	has_prices: false,
	credit_system_feature_ids: creditSystems.map(
		(creditSystem) => creditSystem.id,
	),
	creditSystems,
	entitlementsOverflow: false,
	entityFeatureIdEntitlementsOverflow: false,
	pricesOverflow: false,
});

/**
 * Existence flags for every touched feature + rewrite COUNTs for entries that
 * may rewrite references. One DB round-trip — no current→next, no row bags.
 */
export const setupFeatureStatesContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
}): Promise<UpdateCatalogContext["featureStatesContext"]> => {
	const { db, org, env, features } = ctx;
	const touchedFeatures = paramsToTouchedFeatures({
		features: ctx.features,
		params,
	});

	const entryByFeatureId = new Map(
		params.features.map((entry) => [entry.feature_id, entry]),
	);

	const stateRows = await listFeatureStates({
		db,
		features: touchedFeatures.flatMap((feature) => {
			if (!feature.internal_id) return [];
			const entry = entryByFeatureId.get(feature.id);
			const countRows =
				entry != null &&
				featureUpdateCanRewriteReferences({ current: feature, entry });
			return [
				{
					internalId: feature.internal_id,
					id: feature.id,
					countRows,
				},
			];
		}),
		orgId: org.id,
		env,
	});

	const stateByFeatureId = new Map(
		stateRows.map((row) => [row.feature_id, row]),
	);

	const featureStatesContext: Record<string, FeatureState> = {};

	for (const feature of touchedFeatures) {
		const creditSystems = getCreditSystemsFromFeature({
			featureId: feature.id,
			features,
		});
		const row = stateByFeatureId.get(feature.id);
		const base = emptyFeatureState({ creditSystems });

		featureStatesContext[feature.id] = {
			...base,
			has_customers: row?.has_customers ?? false,
			has_entitlements: row?.has_entitlements ?? false,
			has_loose_entitlements: row?.has_loose_entitlements ?? false,
			has_entity_feature_entitlements:
				row?.has_entity_feature_entitlements ?? false,
			has_loose_entity_feature_entitlements:
				row?.has_loose_entity_feature_entitlements ?? false,
			has_prices: row?.has_prices ?? false,
			entitlementsOverflow: row?.entitlements_overflow ?? false,
			entityFeatureIdEntitlementsOverflow:
				row?.entity_feature_id_entitlements_overflow ?? false,
			pricesOverflow: row?.prices_overflow ?? false,
		};
	}

	return featureStatesContext;
};
