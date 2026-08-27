import {
	type DiffedCustomizePlanV1,
	type FullProduct,
	productToProductKey,
} from "@autumn/shared";
import { diffFullProducts } from "@/internal/catalogV2/actions/buildPlanChange/diffFullProducts";
import { computeUpsertLicensesForVariants } from "@/internal/catalogV2/actions/updateCatalog/compute/computeUpsertProductsPlan/computeVariantPlan/editDiff/computeUpsertLicensesForVariants";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type {
	ProductUpsertIntent,
	ResolvedPlanParams,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";

const isEmptyContentEdit = (diff: DiffedCustomizePlanV1) =>
	diff.price === undefined &&
	diff.add_items === undefined &&
	diff.remove_items === undefined &&
	diff.free_trial === undefined;

const isEmptyEdit = (diff: DiffedCustomizePlanV1) =>
	isEmptyContentEdit(diff) &&
	diff.upsert_licenses === undefined &&
	diff.remove_licenses === undefined;

/** Latest current→next content only. License overlays rebase per sibling. */
const contentEditFromLatest = ({
	upsert,
}: {
	upsert: UpsertProductPlan;
}): DiffedCustomizePlanV1 | undefined => {
	const from = upsert.row.currentFullProduct;
	if (!from) return undefined;

	const {
		upsert_licenses: _upsert,
		remove_licenses: _remove,
		...contentEdit
	} = diffFullProducts({ from, to: upsert.row.nextFullProduct });
	if (isEmptyContentEdit(contentEdit)) return undefined;
	return contentEdit;
};

/** Replay the latest license write onto this sibling's own overlays. */
const licenseEditForSibling = ({
	upsert,
	sibling,
}: {
	upsert: UpsertProductPlan;
	sibling: FullProduct;
}):
	| Pick<DiffedCustomizePlanV1, "upsert_licenses" | "remove_licenses">
	| undefined => {
	const declaredLicenses = upsert.declaredLicenses;
	const baseCurrent = upsert.row.currentFullProduct;
	if (declaredLicenses === undefined || !baseCurrent) return undefined;

	const licenseEdit = computeUpsertLicensesForVariants({
		variantProduct: sibling,
		baseCurrent,
		declaredLicenses,
	});
	if (
		licenseEdit.upsert_licenses === undefined &&
		licenseEdit.remove_licenses === undefined
	) {
		return undefined;
	}
	return licenseEdit;
};

const mergeEdits = ({
	contentEdit,
	licenseEdit,
}: {
	contentEdit?: DiffedCustomizePlanV1;
	licenseEdit?: Pick<
		DiffedCustomizePlanV1,
		"upsert_licenses" | "remove_licenses"
	>;
}): DiffedCustomizePlanV1 | undefined => {
	const editDiff = { ...contentEdit, ...licenseEdit };
	if (isEmptyEdit(editDiff)) return undefined;
	return editDiff;
};

/**
 * Drop absolute content so siblings apply editDiff onto their own row.
 * `new_version_slug` is row identity — a sibling keeps the slug it already has.
 */
const siblingPlanParams = ({
	planParams,
	version,
}: {
	planParams: ProductUpsertIntent["planParams"];
	version: number;
}): ResolvedPlanParams => {
	const {
		items: _items,
		price: _price,
		free_trial: _freeTrial,
		version: _version,
		licenses: _licenses,
		new_version_slug: _newVersionSlug,
		...rest
	} = planParams;
	return { ...rest, version };
};

/**
 * Version edge: a folded direct intent extends to every other existing version
 * of the same plan — `all_versions` content, and/or `unlink` on the pointer.
 */
export const deriveVersionSiblingIntents = ({
	intent,
	upsert,
	projectedProductStatesContext,
}: {
	intent: ProductUpsertIntent;
	upsert: UpsertProductPlan;
	projectedProductStatesContext: ProductStatesContext;
}): ProductUpsertIntent[] => {
	// A sync already carries the mapping to one row; re-deriving would loop.
	if (intent.source === "processor_sync") return [];
	// Mapping fan-out rides any lane: a variant reached by propagation still
	// owes the id to its own versions. Every other edge stays direct-only.
	const declaredProcessors = intent.planParams.processors;
	if (intent.source !== "direct" && declaredProcessors === undefined) return [];
	const inheritAllVersions = intent.planParams.versioning === "all_versions";
	const explicitUnlink = intent.planParams.base_variant_id === null;
	const versions =
		projectedProductStatesContext.versionsByPlanId[intent.planParams.plan_id] ??
		[];
	const currentPointer =
		upsert.row.currentFullProduct?.base_internal_product_id;
	const nextPointer = upsert.row.nextFullProduct.base_internal_product_id;

	// First link of a standalone plan claims every version (mirror of unlink).
	const firstLink =
		nextPointer != null &&
		currentPointer == null &&
		versions.every(
			(product) =>
				product.version === intent.productKey.version ||
				product.base_internal_product_id == null,
		);
	// Every version of a plan bills under one Stripe product, so a stated mapping
	// replaces whatever each sibling held — declared, not diffed, since siblings
	// can lag the addressed row.
	if (
		!inheritAllVersions &&
		!upsert.unlink &&
		!firstLink &&
		declaredProcessors === undefined
	) {
		return [];
	}

	const contentEdit = inheritAllVersions
		? contentEditFromLatest({ upsert })
		: undefined;

	return versions
		.filter((product) => {
			if (product.version === intent.productKey.version) return false;
			if (inheritAllVersions || explicitUnlink || firstLink) return true;
			if (declaredProcessors !== undefined) return true;
			return product.base_internal_product_id === currentPointer;
		})
		.map((product) => {
			const editDiff = inheritAllVersions
				? mergeEdits({
						contentEdit,
						licenseEdit: licenseEditForSibling({ upsert, sibling: product }),
					})
				: undefined;
			return {
				productKey: productToProductKey({ product }),
				planParams: inheritAllVersions
					? siblingPlanParams({
							planParams: intent.planParams,
							version: product.version,
						})
					: {
							plan_id: product.id,
							version: product.version,
							...(declaredProcessors !== undefined
								? { processors: declaredProcessors }
								: {}),
						},
				source: inheritAllVersions
					? ("all_versions" as const)
					: upsert.unlink || firstLink
						? ("repoint" as const)
						: ("processor_sync" as const),
				...(editDiff ? { editDiff } : {}),
				...(upsert.unlink ? { unlink: true } : {}),
				...(firstLink ? { baseInternalProductId: nextPointer } : {}),
			};
		});
};
