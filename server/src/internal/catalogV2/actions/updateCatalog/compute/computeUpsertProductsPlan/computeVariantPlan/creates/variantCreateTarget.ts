import {
	type CatalogVariantParams,
	type FullProduct,
	productKeyToString,
} from "@autumn/shared";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import { fullProductForSlug } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/fullProductForSlug";
import { maxVersionForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/maxVersionForPlan";
import { variantEntryMintsRow } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/variantEntryMintsRow";

export type VariantCreateTarget = {
	version: number;
	previous: FullProduct | null;
	newVersionSlug?: string;
};

const latestRowForPlan = ({
	planId,
	productStatesContext,
}: {
	planId: string;
	productStatesContext: ProductStatesContext;
}): FullProduct | null =>
	(
		productStatesContext.versionsByPlanId[planId] ?? []
	).reduce<FullProduct | null>(
		(latest, product) =>
			latest && latest.version > product.version ? latest : product,
		null,
	);

const inheritedVersionSlug = ({
	variant,
	baseVersionSlug,
	productStatesContext,
}: {
	variant: CatalogVariantParams;
	baseVersionSlug: string | undefined;
	productStatesContext: ProductStatesContext;
}): string | undefined => {
	const stated = variant.new_version_slug ?? variant.version_slug;
	if (stated !== undefined || baseVersionSlug === undefined) return stated;
	const taken =
		fullProductForSlug({
			planId: variant.variant_plan_id,
			versionSlug: baseVersionSlug,
			productStatesContext,
		}) !== null;
	return taken ? undefined : baseVersionSlug;
};

export const variantCreateTarget = ({
	variant,
	anchorInternalIds,
	baseVersionSlug,
	productStatesContext,
	claimedProductKeys,
}: {
	variant: CatalogVariantParams;
	anchorInternalIds: Set<string>;
	baseVersionSlug?: string;
	productStatesContext: ProductStatesContext;
	claimedProductKeys?: Set<string>;
}): VariantCreateTarget | null => {
	if (
		!variantEntryMintsRow({ variant, anchorInternalIds, productStatesContext })
	)
		return null;

	const newVersionSlug = inheritedVersionSlug({
		variant,
		baseVersionSlug,
		productStatesContext,
	});
	const maxVersion = maxVersionForPlan({
		planId: variant.variant_plan_id,
		productStatesContext,
	});
	let version = maxVersion + 1;
	while (
		claimedProductKeys?.has(
			productKeyToString({
				productKey: { planId: variant.variant_plan_id, version },
			}),
		)
	)
		version += 1;
	if (maxVersion === 0) {
		return {
			version,
			previous: null,
			...(newVersionSlug ? { newVersionSlug } : {}),
		};
	}

	return {
		version,
		previous: latestRowForPlan({
			planId: variant.variant_plan_id,
			productStatesContext,
		}),
		...(newVersionSlug ? { newVersionSlug } : {}),
	};
};
