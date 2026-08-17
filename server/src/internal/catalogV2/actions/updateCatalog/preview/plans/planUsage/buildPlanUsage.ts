import {
	type CatalogPlanUsage,
	emptyCatalogFeatureUsageBucket,
	emptyCatalogPlanUsage,
	type FullProduct,
} from "@autumn/shared";
import {
	FEATURE_USAGE_COUNT_CAP,
	FEATURE_USAGE_SAMPLE_LIMIT,
} from "@/internal/features/repos/listFeatureUsageSummaries.js";
import type { RemovePlanPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan";
import type {
	PreviewCatalogContext,
	ProductStatesContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";

const toCappedBucket = ({
	samples,
}: {
	samples: { id: string; name: string }[];
}) => {
	const count = samples.length;
	const countCapped = count > FEATURE_USAGE_COUNT_CAP;
	return {
		count: countCapped ? FEATURE_USAGE_COUNT_CAP : count,
		count_capped: countCapped,
		samples: samples.slice(0, FEATURE_USAGE_SAMPLE_LIMIT),
	};
};

const uniqueById = (
	samples: { id: string; name: string }[],
): { id: string; name: string }[] => {
	const seen = new Set<string>();
	return samples.filter((sample) => {
		if (seen.has(sample.id)) return false;
		seen.add(sample.id);
		return true;
	});
};

const licenseParentSamples = ({
	rows,
}: {
	rows: RemovePlanPlan[];
}): { id: string; name: string }[] =>
	uniqueById(
		rows.flatMap((row) =>
			(row.current?.parent_plan_licenses ?? []).map((link) => ({
				id: link.product.id,
				name: link.product.name || link.product.id,
			})),
		),
	);

const rewardProgramSamples = ({
	planId,
	productStatesContext,
}: {
	planId: string;
	productStatesContext: ProductStatesContext;
}): { id: string; name: string }[] =>
	(productStatesContext.rewardProgramsByPlanId[planId] ?? []).map(
		(program) => ({
			id: program.id,
			name: program.id,
		}),
	);

const variantSamples = ({
	rows,
	productStatesContext,
}: {
	rows: RemovePlanPlan[];
	productStatesContext: ProductStatesContext;
}): { id: string; name: string }[] => {
	const baseInternalIds = new Set(
		rows.flatMap((row) =>
			row.current && row.current.base_internal_product_id === null
				? [row.current.internal_id]
				: [],
		),
	);
	if (baseInternalIds.size === 0) return [];

	const latest: FullProduct[] = [];
	for (const versions of Object.values(productStatesContext.versionsByPlanId)) {
		const product = versions[0];
		if (!product?.base_internal_product_id) continue;
		if (!baseInternalIds.has(product.base_internal_product_id)) continue;
		latest.push(product);
	}
	return uniqueById(
		latest.map((product) => ({
			id: product.id,
			name: product.name || product.id,
		})),
	);
};

const persistedKey = ({
	planId,
	allVersions,
	version,
}: {
	planId: string;
	allVersions: boolean;
	version: number;
}): string => (allVersions ? planId : `${planId}:${version}`);

/** Compose remove-plan usage from persisted customers + setup relatives. */
export const buildPlanUsage = ({
	rows,
	previewContext,
	productStatesContext,
}: {
	rows: RemovePlanPlan[];
	previewContext: PreviewCatalogContext | undefined;
	productStatesContext: ProductStatesContext;
}): CatalogPlanUsage => {
	const first = rows[0];
	if (!first) return emptyCatalogPlanUsage();

	const persisted =
		previewContext?.planUsagePersisted[
			persistedKey({
				planId: first.planId,
				allVersions: first.allVersions,
				version: first.version,
			})
		];

	return {
		customers: persisted?.customers ?? emptyCatalogFeatureUsageBucket(),
		license_parents: toCappedBucket({
			samples: licenseParentSamples({ rows }),
		}),
		reward_programs: toCappedBucket({
			samples: rewardProgramSamples({
				planId: first.planId,
				productStatesContext,
			}),
		}),
		variants: toCappedBucket({
			samples: variantSamples({ rows, productStatesContext }),
		}),
	};
};
