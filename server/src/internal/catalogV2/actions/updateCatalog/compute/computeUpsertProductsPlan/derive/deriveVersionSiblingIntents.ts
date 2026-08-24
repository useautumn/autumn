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
	if (intent.source !== "direct") return [];
	const inheritAllVersions = intent.planParams.versioning === "all_versions";
	const nextPointer = upsert.row.nextFullProduct.base_internal_product_id;
	const previousPointer =
		upsert.row.currentFullProduct?.base_internal_product_id;
	const pointerChanged =
		nextPointer != null && nextPointer !== previousPointer;
	if (!inheritAllVersions && !upsert.unlink && !pointerChanged) return [];

	const contentEdit = inheritAllVersions
		? contentEditFromLatest({ upsert })
		: undefined;
	const versions =
		projectedProductStatesContext.versionsByPlanId[intent.planParams.plan_id] ??
		[];

	return versions
		.filter((product) => product.version !== intent.productKey.version)
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
					: { plan_id: product.id, version: product.version },
				source: inheritAllVersions ? ("all_versions" as const) : "repoint",
				...(editDiff ? { editDiff } : {}),
				...(upsert.unlink
					? { unlink: true }
					: pointerChanged
						? { baseInternalProductId: nextPointer }
						: {}),
			};
		});
};
