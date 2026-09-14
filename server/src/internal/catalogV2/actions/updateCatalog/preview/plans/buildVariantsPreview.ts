import type {
	CatalogPlanVersioning,
	CatalogPlanVersioningStrategy,
	CatalogVariantAction,
	CatalogVariantPreview,
	CatalogVariantVersionPreview,
	FullProduct,
	PlanChangeV0,
} from "@autumn/shared";
import { buildPlanChangeFromFullProducts } from "@/internal/catalogV2/actions/buildPlanChange";
import { aliasReplacementForPlan } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/aliasReplacementForPlan";
import {
	catalogRowIdentity,
	defaultVersionSlug,
} from "@/internal/catalogV2/actions/updateCatalog/preview/plans/catalogRowIdentity";
import { withVariantConflicts } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/conflicts/withVariantConflicts";
import { customerUsageForPreview } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/planUsage/buildPlanUsage";
import { computeVersioningOptionsForPlan } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/versioningOptions/computeVersioningOptionsForPlan";
import type { RenameProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/renameProductPlan";
import type {
	PreviewCatalogContext,
	ProductStatesContext,
} from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { variantRowForDeclaredEntry } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/anchoredVariantRow";
import { editedBaseInternalIds } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/editedBaseInternalIds";
import { findFullProductByInternalId } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/findFullProductByInternalId";
import { productKeyToState } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/productKeyToState";
import { variantRowForPropagateTarget } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/variantRowForPropagateTarget";

const byPlanThenVersion = (
	left: CatalogVariantPreview,
	right: CatalogVariantPreview,
) => left.plan_id.localeCompare(right.plan_id) || left.version - right.version;

const byVersionAscending = (
	left: CatalogVariantVersionPreview,
	right: CatalogVariantVersionPreview,
) => left.version - right.version;

const findVariantUpsert = ({
	upsertProducts,
	planId,
	version,
}: {
	upsertProducts: UpsertProductPlan[];
	planId: string;
	version: number;
}): UpsertProductPlan | undefined =>
	upsertProducts.find(
		(upsert) => upsert.row.planId === planId && upsert.row.version === version,
	);

/** Mints land at max+1, which is not active+1 once a plan has an older active row. */
const findVariantMintUpsert = ({
	upsertProducts,
	planId,
}: {
	upsertProducts: UpsertProductPlan[];
	planId: string;
}): UpsertProductPlan | undefined =>
	upsertProducts.find(
		(upsert) =>
			upsert.row.planId === planId &&
			upsert.row.op === "create" &&
			upsert.row.source === "variant_propagation",
	);

const resolveVariantAction = ({
	variantPlanId,
	version,
	previewVersion,
	base,
	productStatesContext,
}: {
	variantPlanId: string;
	version: number;
	previewVersion: number;
	base: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): CatalogVariantAction => {
	const versionIsTargeted = ({
		targetVersion,
	}: {
		targetVersion: number | undefined;
	}) => {
		if (targetVersion !== undefined) return targetVersion === version;
		if (base.row.versioning === "all_versions") return true;
		return version === previewVersion;
	};
	const anchorInternalIds = editedBaseInternalIds({ upsert: base });
	// Same rule as compute: every declared entry that resolves here is a target,
	// whether it carries content, an archive flag, or only the link itself.
	if (
		base.declaredVariants?.some((declared) => {
			if (declared.variant_plan_id !== variantPlanId) return false;
			const declaredRow = variantRowForDeclaredEntry({
				variant: declared,
				anchorInternalIds,
				productStatesContext,
			});
			return versionIsTargeted({ targetVersion: declaredRow?.version });
		})
	) {
		return "explicit";
	}
	if (
		base.propagate?.variants?.some((target) => {
			if (target.plan_id !== variantPlanId) return false;
			const targetRow = variantRowForPropagateTarget({
				target,
				anchorInternalIds,
				productStatesContext,
			});
			if (!targetRow) return false;
			return versionIsTargeted({ targetVersion: targetRow.version });
		})
	) {
		return "propagated";
	}
	return "unchanged";
};

/** The base row a variant points at, in the shape a license link reports its target. */
type VariantBaseTarget = {
	base_variant_id: string;
	base_version: number;
	base_version_slug: string;
};

const variantBaseTarget = ({
	baseInternalId,
	productStatesContext,
}: {
	baseInternalId: string | null | undefined;
	productStatesContext: ProductStatesContext;
}): VariantBaseTarget | null => {
	if (!baseInternalId) return null;
	const base = findFullProductByInternalId({
		internalId: baseInternalId,
		productStatesContext,
	});
	if (!base) return null;
	return {
		base_variant_id: base.id,
		base_version: base.version,
		base_version_slug:
			base.version_slug ?? defaultVersionSlug({ version: base.version }),
	};
};

const sameBaseTarget = (
	left: VariantBaseTarget | null,
	right: VariantBaseTarget | null,
): boolean =>
	left?.base_variant_id === right?.base_variant_id &&
	left?.base_version === right?.base_version;

/**
 * Content diff plus the link's own scalars: a moved pointer rides
 * `previous_attributes.base_*`, the way a license link's moved version
 * rides its `previous_attributes.version` / `version_slug`.
 */
const variantPlanChange = ({
	variantUpsert,
	productStatesContext,
}: {
	variantUpsert: UpsertProductPlan | undefined;
	productStatesContext: ProductStatesContext;
}): PlanChangeV0 | undefined => {
	if (!variantUpsert) return undefined;
	const from =
		variantUpsert.row.baseFullProduct ??
		variantUpsert.row.currentFullProduct ??
		undefined;
	const contentChange = buildPlanChangeFromFullProducts({
		from,
		to: variantUpsert.row.nextFullProduct,
	});

	const previousBase = variantBaseTarget({
		baseInternalId: from?.base_internal_product_id,
		productStatesContext,
	});
	const nextBase = variantBaseTarget({
		baseInternalId: variantUpsert.row.nextFullProduct.base_internal_product_id,
		productStatesContext,
	});
	if (!from || sameBaseTarget(previousBase, nextBase)) return contentChange;

	return {
		item_changes: [],
		...contentChange,
		previous_attributes: {
			...contentChange?.previous_attributes,
			base_variant_id: previousBase?.base_variant_id ?? null,
			base_version: previousBase?.base_version ?? null,
			base_version_slug: previousBase?.base_version_slug ?? null,
		},
	};
};

const variantPreviewState = ({
	planId,
	version,
	productStatesContext,
	previewContext,
}: {
	planId: string;
	version: number;
	productStatesContext: ProductStatesContext;
	previewContext: PreviewCatalogContext | undefined;
}) => {
	const variantState = productKeyToState({
		productKey: { planId, version },
		productStatesContext,
	});
	return {
		has_customers: variantState.customerUsage.hasVersionableCustomerProducts,
		will_archive: false,
		usage: customerUsageForPreview({
			planId,
			version,
			previewContext,
		}),
	};
};

const variantVersioningOptions = ({
	variant,
	productStatesContext,
}: {
	variant: FullProduct;
	productStatesContext: ProductStatesContext;
}): CatalogPlanVersioningStrategy[] => {
	const state = productKeyToState({
		productKey: { planId: variant.id, version: variant.version },
		productStatesContext,
	});
	return computeVersioningOptionsForPlan({
		hasCustomers: state.customerUsage.hasVersionableCustomerProducts,
		isLatestVersion: true,
		hasMultipleVersions:
			(productStatesContext.versionsByPlanId[variant.id]?.length ?? 0) > 1,
	});
};

const variantVersioning = ({
	variant,
	mintUpsert,
	base,
	productStatesContext,
}: {
	variant: FullProduct;
	mintUpsert: UpsertProductPlan | undefined;
	base: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): CatalogPlanVersioning => {
	const resolved = mintUpsert
		? ("new_version" as const)
		: base.row.versioning === "all_versions"
			? ("all_versions" as const)
			: ("existing" as const);

	return {
		current_version: variant.version,
		new_version: mintUpsert?.row.version ?? null,
		resolved,
		options: variantVersioningOptions({ variant, productStatesContext }),
	};
};

/** Other rows of this variant plan anchored to the same base row. */
const siblingVersionsForVariant = ({
	variant,
	anchoredRows,
	upsertProducts,
	productStatesContext,
	previewContext,
	editedCurrent,
	editedNext,
	previewVersion,
	base,
}: {
	variant: FullProduct;
	anchoredRows: FullProduct[];
	upsertProducts: UpsertProductPlan[];
	productStatesContext: ProductStatesContext;
	previewContext: PreviewCatalogContext | undefined;
	editedCurrent: FullProduct | null;
	editedNext: FullProduct;
	previewVersion: number;
	base: UpsertProductPlan;
}): CatalogVariantVersionPreview[] =>
	anchoredRows
		.filter((product) => product.version !== previewVersion)
		.map((product) => {
			const siblingUpsert = findVariantUpsert({
				upsertProducts,
				planId: product.id,
				version: product.version,
			});
			const siblingAction = resolveVariantAction({
				variantPlanId: variant.id,
				version: product.version,
				previewVersion,
				base,
				productStatesContext,
			});
			const planChange = variantPlanChange({
				variantUpsert: siblingUpsert,
				productStatesContext,
			});
			const preview: CatalogVariantVersionPreview = {
				...catalogRowIdentity({
					planId: product.id,
					version: product.version,
					current: product,
					next: siblingUpsert?.row.nextFullProduct ?? product,
				}),
				state: variantPreviewState({
					planId: product.id,
					version: product.version,
					productStatesContext,
					previewContext,
				}),
				variant_action: siblingAction,
				...(planChange ? { plan_change: planChange } : {}),
			};
			if (siblingAction === "explicit") return preview;
			return withVariantConflicts({
				preview,
				current: editedCurrent,
				next: editedNext,
				relative: product,
			});
		})
		.sort(byVersionAscending);

/** Where a variant row points after this update — its upsert's next pointer, else its current one. */
const nextBaseInternalIdFor = ({
	row,
	upsertProducts,
}: {
	row: FullProduct;
	upsertProducts: UpsertProductPlan[];
}): string | null | undefined => {
	const rowUpsert = findVariantUpsert({
		upsertProducts,
		planId: row.id,
		version: row.version,
	});
	return (
		rowUpsert?.row.nextFullProduct.base_internal_product_id ??
		row.base_internal_product_id
	);
};

/** Anchored rows per variant plan: [representative, ...other anchored rows]. */
const anchoredRowsByVariantPlan = ({
	upsert,
	upsertProducts,
	productStatesContext,
}: {
	upsert: UpsertProductPlan;
	upsertProducts: UpsertProductPlan[];
	productStatesContext: ProductStatesContext;
}): Map<string, FullProduct[]> => {
	const anchors = editedBaseInternalIds({ upsert });
	// Anchor on the post-update pointer: a row this update moves here belongs
	// here, and one it moves away no longer does.
	const anchored = Object.values(productStatesContext.versionsByPlanId)
		.flat()
		.filter((row) => {
			const nextBase = nextBaseInternalIdFor({ row, upsertProducts });
			if (!nextBase || !anchors.has(nextBase)) return false;
			if (!row.archived) return true;
			const rowUpsert = findVariantUpsert({
				upsertProducts,
				planId: row.id,
				version: row.version,
			});
			return rowUpsert?.row.nextFullProduct.archived === false;
		});
	const byPlan = new Map<string, FullProduct[]>();
	for (const row of anchored) {
		if (row.id === upsert.row.planId) continue;
		byPlan.set(row.id, [...(byPlan.get(row.id) ?? []), row]);
	}
	for (const [planId, rows] of byPlan) {
		const representative =
			rows.find((row) => row.active) ??
			rows.slice().sort((left, right) => right.version - left.version)[0];
		byPlan.set(planId, [
			representative,
			...rows.filter((row) => row !== representative),
		]);
	}
	return byPlan;
};

/** Declared variants that do not exist yet: `variant_link` creates anchored to this base row. */
const variantCreatesForBase = ({
	directUpsert,
	upsertProducts,
}: {
	directUpsert: UpsertProductPlan;
	upsertProducts: UpsertProductPlan[];
}): UpsertProductPlan[] => {
	const anchors = new Set(editedBaseInternalIds({ upsert: directUpsert }));
	return upsertProducts.filter((upsert) => {
		const baseInternalId = upsert.row.nextFullProduct.base_internal_product_id;
		return (
			upsert.row.source === "variant_link" &&
			upsert.row.op === "create" &&
			typeof baseInternalId === "string" &&
			anchors.has(baseInternalId)
		);
	});
};

/** A variant the config declares that the catalog does not have yet. */
const variantCreatePreview = ({
	createUpsert,
	previewContext,
	renamePlans,
	productStatesContext,
}: {
	createUpsert: UpsertProductPlan;
	previewContext: PreviewCatalogContext | undefined;
	renamePlans: RenameProductPlan[];
	productStatesContext: ProductStatesContext;
}): CatalogVariantPreview => {
	const { planId, version, nextFullProduct } = createUpsert.row;
	const planChange = variantPlanChange({
		variantUpsert: createUpsert,
		productStatesContext,
	});
	const aliasReplacement = aliasReplacementForPlan({
		planId,
		upsert: createUpsert,
		renamePlans,
	});
	return {
		...catalogRowIdentity({
			planId,
			version,
			current: null,
			next: nextFullProduct,
		}),
		state: {
			has_customers: false,
			will_archive: false,
			usage: customerUsageForPreview({ planId, version, previewContext }),
		},
		variant_action: "explicit",
		...(planChange ? { plan_change: planChange } : {}),
		...(aliasReplacement ? { alias_replacement: aliasReplacement } : {}),
	};
};

/** Variant rows anchored to THIS base row. Empty → omit the lane. */
export const buildVariantsPreview = ({
	directUpsert,
	upsertProducts,
	productStatesContext,
	previewContext,
	renamePlans,
}: {
	directUpsert: UpsertProductPlan;
	upsertProducts: UpsertProductPlan[];
	productStatesContext: ProductStatesContext;
	previewContext: PreviewCatalogContext | undefined;
	renamePlans: RenameProductPlan[];
}): CatalogVariantPreview[] => {
	const anchoredByPlan = anchoredRowsByVariantPlan({
		upsert: directUpsert,
		upsertProducts,
		productStatesContext,
	});
	const creates = variantCreatesForBase({ directUpsert, upsertProducts });
	if (anchoredByPlan.size === 0 && creates.length === 0) return [];

	const editedCurrent = directUpsert.row.currentFullProduct;
	const editedNext = directUpsert.row.nextFullProduct;

	const createPreviews = creates.map((createUpsert) =>
		variantCreatePreview({
			createUpsert,
			previewContext,
			renamePlans,
			productStatesContext,
		}),
	);
	const existingPreviews = [...anchoredByPlan.values()].map(
		([variant, ...anchoredSiblings]) => {
			const mintUpsert = findVariantMintUpsert({
				upsertProducts,
				planId: variant.id,
			});
			const variantUpsert =
				mintUpsert ??
				findVariantUpsert({
					upsertProducts,
					planId: variant.id,
					version: variant.version,
				});
			const previewVersion = mintUpsert?.row.version ?? variant.version;
			const variantAction = resolveVariantAction({
				variantPlanId: variant.id,
				version: previewVersion,
				previewVersion,
				base: directUpsert,
				productStatesContext,
			});
			const planChange = variantPlanChange({
				variantUpsert,
				productStatesContext,
			});
			const aliasReplacement = aliasReplacementForPlan({
				planId: variant.id,
				upsert: variantUpsert,
				renamePlans,
			});
			const siblingVersions = siblingVersionsForVariant({
				variant,
				anchoredRows: [variant, ...anchoredSiblings],
				upsertProducts,
				productStatesContext,
				previewContext,
				editedCurrent,
				editedNext,
				previewVersion,
				base: directUpsert,
			});
			const preview = {
				...catalogRowIdentity({
					planId: variant.id,
					version: previewVersion,
					current: mintUpsert ? null : variant,
					next: variantUpsert?.row.nextFullProduct ?? variant,
				}),
				versioning: variantVersioning({
					variant,
					mintUpsert,
					base: directUpsert,
					productStatesContext,
				}),
				state: variantPreviewState({
					planId: variant.id,
					version: variant.version,
					productStatesContext,
					previewContext,
				}),
				variant_action: variantAction,
				...(planChange ? { plan_change: planChange } : {}),
				...(siblingVersions.length > 0
					? { sibling_versions: siblingVersions }
					: {}),
				...(aliasReplacement ? { alias_replacement: aliasReplacement } : {}),
			};
			if (variantAction === "explicit") return preview;
			return withVariantConflicts({
				preview,
				current: editedCurrent,
				next: editedNext,
				// Pre-edit variant. Follow's next already applied the diff.
				relative: variant,
			});
		},
	);
	return [...existingPreviews, ...createPreviews].sort(byPlanThenVersion);
};
