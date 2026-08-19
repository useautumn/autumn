import type { CatalogVariantParams } from "@autumn/shared";
import { productKeyToString } from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { latestVariantsOfBase } from "../variantPlanUtils";

/** One existing variant row (plan_id@version) the base edit must touch. */
export type VariantEditTarget = {
	planId: string;
	version: number;
	follow: boolean;
	customize?: CatalogVariantParams["customize"];
	archived?: boolean;
};

type TargetSourceArgs = {
	upsert: UpsertProductPlan;
	inheritAllVersions: boolean;
	productStatesContext: ProductStatesContext;
};

/** Width rule: `all_versions` with no explicit version fans out to every
 * version; otherwise the named version (if it exists) or the latest. */
const targetVersionsFor = ({
	planId,
	version,
	inheritAllVersions,
	productStatesContext,
}: {
	planId: string;
	version?: number;
	inheritAllVersions: boolean;
	productStatesContext: ProductStatesContext;
}): number[] => {
	const versions = productStatesContext.versionsByPlanId[planId] ?? [];
	if (inheritAllVersions && version === undefined) {
		return versions.map((product) => product.version);
	}
	if (version === undefined) {
		return versions[0] !== undefined ? [versions[0].version] : [];
	}
	return versions.some((product) => product.version === version)
		? [version]
		: [];
};

const targetsFromPropagate = ({
	upsert,
	inheritAllVersions,
	productStatesContext,
}: TargetSourceArgs): VariantEditTarget[] =>
	(upsert.propagate?.variants ?? []).flatMap((target) =>
		targetVersionsFor({
			planId: target.plan_id,
			version: target.version,
			inheritAllVersions,
			productStatesContext,
		}).map((version) => ({ planId: target.plan_id, version, follow: true })),
	);

const targetsFromDeclaredCustomize = ({
	upsert,
	inheritAllVersions,
	productStatesContext,
}: TargetSourceArgs): VariantEditTarget[] =>
	(upsert.declaredVariants ?? []).flatMap((variant) => {
		if (!variant.customize && variant.archived === undefined) return [];
		return targetVersionsFor({
			planId: variant.variant_plan_id,
			version: variant.version,
			inheritAllVersions,
			productStatesContext,
		}).map((version) => ({
			planId: variant.variant_plan_id,
			version,
			follow: false,
			...(variant.customize ? { customize: variant.customize } : {}),
			...(variant.archived !== undefined
				? { archived: variant.archived }
				: {}),
		}));
	});

/** Settings and pointer writes must reach every latest variant, named or not. */
const targetsForLatestSweep = ({
	upsert,
	productStatesContext,
}: {
	upsert: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): VariantEditTarget[] =>
	latestVariantsOfBase({
		upsert,
		productStatesContext,
		includeArchived: true,
	}).map((variant) => ({
		planId: variant.id,
		version: variant.version,
		follow: false,
	}));

/** Same row named twice: follow is OR'd, the later customize wins.
 * Rows the mint lane owns are skipped. */
const mergeTargets = ({
	targets,
	mintedPlanIds,
}: {
	targets: VariantEditTarget[];
	mintedPlanIds: Set<string>;
}): VariantEditTarget[] => {
	const byKey = new Map<string, VariantEditTarget>();
	for (const target of targets) {
		if (mintedPlanIds.has(target.planId)) continue;
		const key = productKeyToString({
			productKey: { planId: target.planId, version: target.version },
		});
		const current = byKey.get(key);
		if (!current) {
			byKey.set(key, { ...target });
			continue;
		}
		current.follow ||= target.follow;
		if (target.customize !== undefined) current.customize = target.customize;
		if (target.archived !== undefined) current.archived = target.archived;
	}
	return [...byKey.values()];
};

/** Every existing variant row this base edit must touch, one per plan_id@version. */
export const resolveVariantEditTargets = ({
	upsert,
	productStatesContext,
	sweepLatestVariants,
	mintedPlanIds,
}: {
	upsert: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
	sweepLatestVariants: boolean;
	mintedPlanIds: Set<string>;
}): VariantEditTarget[] => {
	const sourceArgs = {
		upsert,
		inheritAllVersions: upsert.row.versioning === "all_versions",
		productStatesContext,
	};

	return mergeTargets({
		targets: [
			...targetsFromPropagate(sourceArgs),
			...targetsFromDeclaredCustomize(sourceArgs),
			...(sweepLatestVariants
				? targetsForLatestSweep({ upsert, productStatesContext })
				: []),
		],
		mintedPlanIds,
	});
};
