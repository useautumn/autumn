import type { UpdateCatalogParams } from "@autumn/shared";
import type {
	ProductStatesContext,
	UpdateCatalogContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { activeFullProductForPlan } from "../../utils/productStateUtils/activeFullProductForPlan";
import { findFullProductByInternalId } from "../../utils/productStateUtils/findFullProductByInternalId";
import { versionForSlug } from "../../utils/productStateUtils/versionForSlug";
import type { RemovePlanTarget } from "./resolveRemoveProductTargets";

const currentIdOf = ({
	internalId,
	productStatesContext,
}: {
	internalId: string | undefined;
	productStatesContext: ProductStatesContext;
}): string[] => {
	if (internalId === undefined) return [];
	const current = findFullProductByInternalId({
		internalId,
		productStatesContext,
	});
	return current ? [current.id] : [];
};

type DesiredRowDeclaration = {
	planId: string;
	internalId?: string;
	version?: number;
	versionSlug?: string;
};

const desiredRowDeclarations = ({
	params,
}: {
	params: UpdateCatalogParams;
}): DesiredRowDeclaration[] =>
	(params.plans ?? []).flatMap((plan) => [
		{
			planId: plan.plan_id,
			internalId: plan.internal_id,
			version: plan.version,
			versionSlug: plan.version_slug,
		},
		...(plan.variants ?? []).map((variant) => ({
			planId: variant.variant_plan_id,
			internalId: variant.internal_id,
			version: variant.version,
			versionSlug: variant.version_slug,
		})),
	]);

const statedPlanIds = ({
	params,
	productStatesContext,
	declarations,
}: {
	params: UpdateCatalogParams;
	productStatesContext: ProductStatesContext;
	declarations: DesiredRowDeclaration[];
}): Set<string> =>
	new Set([
		...declarations.flatMap((declaration) => [
			declaration.planId,
			...currentIdOf({
				internalId: declaration.internalId,
				productStatesContext,
			}),
		]),
		...(params.plans ?? []).flatMap((plan) => [
			...(plan.new_plan_id ? [plan.new_plan_id] : []),
			...(plan.variants ?? []).flatMap((variant) =>
				variant.new_plan_id ? [variant.new_plan_id] : [],
			),
		]),
		...params.remove_plans.map((entry) => entry.plan_id),
		...params.skip_plan_ids,
	]);

export const resolveAbsenteePlanTargets = ({
	params,
	catalogContext,
}: {
	params: UpdateCatalogParams;
	catalogContext: UpdateCatalogContext;
}): RemovePlanTarget[] => {
	if (params.skip_deletions !== false) return [];
	if (params.plans === undefined) return [];

	const declarations = desiredRowDeclarations({ params });
	const stated = statedPlanIds({
		params,
		productStatesContext: catalogContext.productStatesContext,
		declarations,
	});
	const absent = Object.entries(
		catalogContext.productStatesContext.versionsByPlanId,
	).filter(
		([planId, versions]) =>
			!stated.has(planId) && versions.some((product) => !product.archived),
	);

	const wholePlans = absent.flatMap(([planId, versions]) =>
		versions
			.filter((product) => !product.archived)
			.map((product) => ({
				planId,
				version: product.version,
				current: product,
				allVersions: true,
			})),
	);
	if (params.skip_version_deletions !== false) return wholePlans;
	return [
		...wholePlans,
		...absentVersionTargets({ catalogContext, stated, declarations }),
	];
};

const absentVersionTargets = ({
	catalogContext,
	stated,
	declarations,
}: {
	catalogContext: UpdateCatalogContext;
	stated: Set<string>;
	declarations: DesiredRowDeclaration[];
}): RemovePlanTarget[] => {
	const { productStatesContext, internalIdRefs } = catalogContext;
	const statedVersions = new Map<string, Set<number>>();
	for (const declaration of declarations) {
		const ref =
			declaration.internalId === undefined
				? undefined
				: internalIdRefs.get(declaration.internalId);
		const planId = ref?.planId ?? declaration.planId;
		const version =
			ref?.version ??
			declaration.version ??
			(declaration.versionSlug === undefined
				? activeFullProductForPlan({ planId, productStatesContext })?.version
				: versionForSlug({
						planId,
						versionSlug: declaration.versionSlug,
						productStatesContext,
					}));
		if (version === undefined) continue;
		const versions = statedVersions.get(planId) ?? new Set<number>();
		versions.add(version);
		statedVersions.set(planId, versions);
	}
	return [...statedVersions.entries()].flatMap(([planId, versions]) => {
		if (!stated.has(planId)) return [];
		const existing = productStatesContext.versionsByPlanId[planId] ?? [];
		return existing
			.filter((product) => !product.archived && !versions.has(product.version))
			.map((product) => ({
				planId,
				version: product.version,
				current: product,
				allVersions: false,
			}));
	});
};
