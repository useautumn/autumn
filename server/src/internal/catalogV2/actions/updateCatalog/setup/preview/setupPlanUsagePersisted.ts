import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { listPlanCustomerUsage } from "@/internal/catalogV2/actions/updateCatalog/setup/preview/listPlanCustomerUsage";
import type {
	PersistedPlanUsage,
	ProductStatesContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import {
	FEATURE_USAGE_COUNT_CAP,
	FEATURE_USAGE_SAMPLE_LIMIT,
} from "@/internal/features/repos/listFeatureUsageSummaries.js";

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
		count: countCapped
			? Math.min(count, FEATURE_USAGE_COUNT_CAP)
			: count,
		count_capped: countCapped,
		samples: samples.slice(0, FEATURE_USAGE_SAMPLE_LIMIT),
	};
};

const usageKey = ({
	planId,
	version,
}: {
	planId: string;
	version?: number;
}): string => (version === undefined ? planId : `${planId}:${version}`);

const uniqueCandidates = (
	candidates: { key: string; internalProductIds: string[] }[],
) => {
	const byKey = new Map<string, { key: string; internalProductIds: string[] }>();
	for (const candidate of candidates) {
		byKey.set(candidate.key, candidate);
	}
	return [...byKey.values()];
};

/** Capped customer samples for preview/UI only. Ids come from product states. */
export const setupPlanUsagePersisted = async ({
	ctx,
	params,
	productStatesContext,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
}): Promise<Record<string, PersistedPlanUsage>> => {
	const summaries: Record<string, PersistedPlanUsage> = {};

	const removeCandidates = params.remove_plans.map((entry) => {
		const versions =
			productStatesContext.versionsByPlanId[entry.plan_id] ?? [];
		const targeted =
			entry.version === undefined
				? versions
				: versions.filter((product) => product.version === entry.version);
		return {
			key: usageKey({ planId: entry.plan_id, version: entry.version }),
			internalProductIds: targeted.map((product) => product.internal_id),
		};
	});

	const productCandidates = Object.values(
		productStatesContext.versionsByPlanId,
	).flatMap((versions) =>
		versions.map((product) => ({
			key: usageKey({ planId: product.id, version: product.version }),
			internalProductIds: [product.internal_id],
		})),
	);

	const candidates = uniqueCandidates([
		...removeCandidates,
		...productCandidates,
	]);
	if (candidates.length === 0) return summaries;

	const rows = await listPlanCustomerUsage({
		db: ctx.db,
		candidates,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const rowByKey = new Map(rows.map((row) => [row.usage_key, row]));

	for (const candidate of candidates) {
		const row = rowByKey.get(candidate.key);
		summaries[candidate.key] = {
			customers: toCappedBucket({
				count: row?.customer_count ?? 0,
				capped: row?.customer_capped,
				samples: row?.customer_samples ?? [],
			}),
		};
	}

	return summaries;
};
