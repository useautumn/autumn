import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import type { PersistedFeatureUsage } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { paramsToTouchedFeatures } from "@/internal/catalogV2/actions/updateCatalog/utils/featureUpdateUtils/paramsToTouchedFeatures";
import {
	FEATURE_USAGE_COUNT_CAP,
	FEATURE_USAGE_SAMPLE_LIMIT,
	listFeatureUsageSummaries,
} from "@/internal/features/repos/listFeatureUsageSummaries.js";

const emptyPersistedBucket = () => ({
	count: 0,
	count_capped: false,
	samples: [] as { id: string; name: string }[],
});

const emptyPersistedFeatureUsage = (): PersistedFeatureUsage => ({
	plans: emptyPersistedBucket(),
	customers: emptyPersistedBucket(),
});

const toCappedBucket = ({
	count,
	capped,
	samples = [],
}: {
	count: number;
	capped?: boolean;
	samples?: { id: string; name: string }[];
}) => {
	const countCapped = capped || count > FEATURE_USAGE_COUNT_CAP;
	return {
		count: countCapped ? Math.min(count, FEATURE_USAGE_COUNT_CAP) : count,
		count_capped: countCapped,
		samples: samples.slice(0, FEATURE_USAGE_SAMPLE_LIMIT),
	};
};

/**
 * Capped plan/customer usage for touched features — preview/UI only.
 * Credit-system buckets are composed later from the projected catalog.
 */
export const setupFeatureUsagePersisted = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
}): Promise<Record<string, PersistedFeatureUsage>> => {
	const touchedFeatures = paramsToTouchedFeatures({
		features: ctx.features,
		params,
	}).filter((feature) => feature.internal_id);

	const rows = await listFeatureUsageSummaries({
		db: ctx.db,
		features: touchedFeatures.map((feature) => ({
			internalId: feature.internal_id!,
			id: feature.id,
		})),
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const rowByFeatureId = new Map(rows.map((row) => [row.feature_id, row]));

	const summaries: Record<string, PersistedFeatureUsage> = {};

	for (const feature of touchedFeatures) {
		const row = rowByFeatureId.get(feature.id);

		summaries[feature.id] = {
			plans: toCappedBucket({
				count: row?.plan_count ?? 0,
				capped: row?.plan_capped,
				samples: row?.plan_samples ?? [],
			}),
			customers: toCappedBucket({
				count: row?.customer_count ?? 0,
				capped: row?.customer_capped,
				samples: row?.customer_samples ?? [],
			}),
		};
	}

	for (const entry of params.features) {
		if (!summaries[entry.feature_id]) {
			summaries[entry.feature_id] = emptyPersistedFeatureUsage();
		}
	}
	for (const entry of params.remove_features ?? []) {
		if (!summaries[entry.feature_id]) {
			summaries[entry.feature_id] = emptyPersistedFeatureUsage();
		}
	}

	return summaries;
};
