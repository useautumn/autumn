import type {
	ApiPlanV1,
	DiffedCustomizePlanV1,
	Feature,
	FrontendProduct,
	MigrationFilter,
	Operations,
	ProductItem,
	UpdatePlanOp,
	UpdatePlanParamsV2Input,
} from "@autumn/shared";
import {
	diffPlanV1,
	itemToBillingInterval,
	productItemsToPlanItemsV1,
	productV2ToBasePrice,
	productV2ToFeatureItems,
	sortProductItems,
} from "@autumn/shared";
import { migrationUid } from "@/views/migrations/migration/shared/operationUtils";
import { alignTierCurrencyShapes } from "../utils/currencyUtils";

export interface MigrationDraft {
	id: string;
	filter: MigrationFilter;
	operations: Operations;
	no_billing_changes: boolean;
}

export function frontendProductToApiPlanV1(
	product: FrontendProduct,
	features: Feature[],
): ApiPlanV1 {
	const sorted = sortProductItems(product.items, features);
	const basePriceItem = productV2ToBasePrice({ product: product as any });
	const featureItems = productV2ToFeatureItems({
		items: sorted,
		withBasePrice: false,
	});
	const planItems = productItemsToPlanItemsV1({
		items: featureItems,
		features,
	});

	const basePrice: ApiPlanV1["price"] = basePriceItem
		? {
				amount: basePriceItem.price,
				...(basePriceItem.additional_currencies?.length
					? { additional_currencies: basePriceItem.additional_currencies }
					: {}),
				interval: itemToBillingInterval({ item: basePriceItem }),
				...(basePriceItem.interval_count !== 1 &&
				typeof basePriceItem.interval_count === "number"
					? { interval_count: basePriceItem.interval_count }
					: {}),
			}
		: null;

	const freeTrial: ApiPlanV1["free_trial"] = product.free_trial
		? {
				duration_type: product.free_trial.duration,
				duration_length: product.free_trial.length,
				card_required: product.free_trial.card_required ?? false,
				...(product.free_trial.on_end
					? { on_end: product.free_trial.on_end }
					: {}),
			}
		: undefined;

	return {
		id: product.id,
		name: product.name || "",
		description: product.description || null,
		group: product.group || null,
		version: product.version,
		add_on: product.is_add_on,
		auto_enable: product.is_default,
		price: basePrice,
		items: planItems,
		free_trial: freeTrial,
		created_at: product.created_at,
		env: product.env,
		archived: product.archived ?? false,
		base_variant_id: null,
		config: product.config ?? { ignore_past_due: false },
		billing_controls: product.billing_controls,
	} satisfies ApiPlanV1;
}

function planItemsToUpdateParams(
	items: ApiPlanV1["items"],
): NonNullable<UpdatePlanParamsV2Input["items"]> {
	return items.map(
		({ feature, display, reset, price, proration, rollover, ...item }) => ({
			...item,
			...(reset ? { reset } : {}),
			...(price ? { price } : {}),
			...(proration ? { proration } : {}),
			...(rollover
				? {
						rollover: {
							expiry_duration_type: rollover.expiry_duration_type,
							expiry_duration_length: rollover.expiry_duration_length,
							...(rollover.max != null ? { max: rollover.max } : {}),
							...(rollover.max_percentage != null
								? { max_percentage: rollover.max_percentage }
								: {}),
						},
					}
				: {}),
		}),
	);
}

export function buildInPlaceUpdatePlanParams({
	baseProduct,
	editedProduct,
	features,
}: {
	baseProduct: FrontendProduct;
	editedProduct: FrontendProduct;
	features: Feature[];
}): UpdatePlanParamsV2Input {
	const plan = frontendProductToApiPlanV1(
		{
			...editedProduct,
			items: editedProduct.items.map((item) =>
				alignTierCurrencyShapes(item as ProductItem),
			) as typeof editedProduct.items,
		},
		features,
	);

	return {
		plan_id: baseProduct.id,
		version: baseProduct.version,
		name: plan.name,
		description: plan.description ?? "",
		group: plan.group ?? "",
		add_on: plan.add_on,
		auto_enable: plan.auto_enable,
		price: plan.price,
		items: planItemsToUpdateParams(plan.items),
		free_trial: plan.free_trial ?? null,
		config: plan.config,
		billing_controls: plan.billing_controls,
		disable_version: true,
	} satisfies UpdatePlanParamsV2Input;
}

// Preview params mirror the in-place update but drop disable_version so the
// backend reports whether applying in place would version.
export function buildPreviewUpdatePlanParams({
	baseProduct,
	editedProduct,
	features,
}: {
	baseProduct: FrontendProduct | null;
	editedProduct: FrontendProduct;
	features: Feature[];
}): UpdatePlanParamsV2Input {
	const params = buildInPlaceUpdatePlanParams({
		baseProduct: baseProduct ?? editedProduct,
		editedProduct,
		features,
	});
	delete params.disable_version;
	params.include_versions = true;
	params.include_variants = true;
	return params;
}

function diffHasBillingChanges(diff: DiffedCustomizePlanV1): boolean {
	if (diff.price !== undefined) return true;
	if (diff.add_items?.some((i) => i.price != null)) return true;
	return false;
}

// Unlike `diffHasBillingChanges`, also flags pure removals of priced items so
// the migration UI can warn about any change to what customers are billed.
export function planHasPricingChange({
	baseProduct,
	product,
	features,
}: {
	baseProduct: FrontendProduct;
	product: FrontendProduct;
	features: Feature[];
}): boolean {
	const from = frontendProductToApiPlanV1(baseProduct, features);
	const to = frontendProductToApiPlanV1(product, features);
	const diff = diffPlanV1({ from, to });
	if (diff.price !== undefined) return true;
	if (diff.add_items?.some((item) => item.price != null)) return true;
	// Remove filters can omit billing_method even when priced, so check the
	// source items by feature_id rather than the lossy filter.
	const removedFeatureIds = new Set(
		diff.remove_items?.map((item) => item.feature_id) ?? [],
	);
	return (
		from.items?.some(
			(item) => item.price != null && removedFeatureIds.has(item.feature_id),
		) ?? false
	);
}

function getMigratablePlanDiff(
	diff: DiffedCustomizePlanV1,
): DiffedCustomizePlanV1 {
	return {
		...(diff.price !== undefined ? { price: diff.price } : {}),
		...(diff.add_items !== undefined ? { add_items: diff.add_items } : {}),
		...(diff.remove_items !== undefined
			? { remove_items: diff.remove_items }
			: {}),
		...(diff.update_items !== undefined
			? { update_items: diff.update_items }
			: {}),
	};
}

export type MigrationScope = "this_version" | "all_customers";

export type VersionMigrateScope = "all" | number;

export function buildVersionMigrationDraft({
	productId,
	latestVersion,
	scope,
	pastVersions,
	hasPricingChange,
	includeCustom = false,
}: {
	productId: string;
	latestVersion: number;
	scope: VersionMigrateScope;
	pastVersions: number[];
	hasPricingChange: boolean;
	includeCustom?: boolean;
}): MigrationDraft {
	const versions = scope === "all" ? pastVersions : [scope];
	const versionMatcher =
		versions.length === 1 ? versions[0] : { $in: versions };
	const basePlanFilter = {
		plan_id: productId,
		version: versionMatcher,
	};
	const planFilter = includeCustom
		? basePlanFilter
		: { ...basePlanFilter, custom: false };
	const versionOp = (custom: boolean): UpdatePlanOp => ({
		type: "update_plan",
		plan_filter: { ...basePlanFilter, custom },
		version: latestVersion,
	});
	const versionOpWithoutCustom = (): UpdatePlanOp => ({
		type: "update_plan",
		plan_filter: basePlanFilter,
		version: latestVersion,
	});

	const filter: MigrationFilter = {
		customer: { plan: planFilter },
	};

	const operations: Operations = {
		customer: includeCustom ? [versionOpWithoutCustom()] : [versionOp(false)],
	};

	const suffix = scope === "all" ? "migrate-all" : `migrate-v${scope}`;

	return {
		id: `${productId}-${suffix}-to-v${latestVersion}-${migrationUid()}`,
		filter,
		operations,
		no_billing_changes: !hasPricingChange,
	};
}

export function buildMigrationDraft({
	baseProduct,
	editedProduct,
	features,
	scope,
	includeCustom = false,
}: {
	baseProduct: FrontendProduct;
	editedProduct: FrontendProduct;
	features: Feature[];
	scope: MigrationScope;
	includeCustom?: boolean;
}): MigrationDraft {
	const from = frontendProductToApiPlanV1(baseProduct, features);
	const to = frontendProductToApiPlanV1(editedProduct, features);
	const diff = diffPlanV1({ from, to });
	const migrationDiff = getMigratablePlanDiff(diff);

	const hasCustomize = Object.keys(migrationDiff).length > 0;
	const customize = hasCustomize ? migrationDiff : undefined;

	const basePlanFilter = {
		plan_id: baseProduct.id,
		...(scope === "this_version" ? { version: baseProduct.version } : {}),
	};
	const planFilter = includeCustom
		? basePlanFilter
		: { ...basePlanFilter, custom: false };
	const updatePlanOp: UpdatePlanOp = {
		type: "update_plan",
		plan_filter: planFilter,
		...(customize ? { customize } : {}),
	};

	const filter: MigrationFilter = {
		customer: { plan: planFilter },
	};

	const suffix = scope === "all_customers" ? "update-all" : "update";

	return {
		id: `${baseProduct.id}-${suffix}-${migrationUid()}`,
		filter,
		operations: {
			customer: [updatePlanOp],
		},
		no_billing_changes: diffHasBillingChanges(migrationDiff) === false,
	};
}

export interface CombinedVariantTarget {
	id: string;
	version: number;
}

export interface AllVersionsUpdateMigrationTarget {
	id: string;
	customize: DiffedCustomizePlanV1 | null;
}

// Version resets re-materialize customer entitlements from the updated catalog.
export function buildCombinedVariantMigrationDraft({
	variants,
	hasPricingChange,
	includeCustom = false,
}: {
	variants: CombinedVariantTarget[];
	hasPricingChange: boolean;
	includeCustom?: boolean;
}): MigrationDraft | null {
	if (variants.length === 0) return null;

	const planIds = variants.map((v) => v.id);
	const planMatcher = planIds.length === 1 ? planIds[0] : { $in: planIds };

	const basePlanFilter = { plan_id: planMatcher };
	const planFilter = includeCustom
		? basePlanFilter
		: { ...basePlanFilter, custom: false };

	const byVersion = new Map<number, string[]>();
	for (const variant of variants) {
		const ids = byVersion.get(variant.version) ?? [];
		ids.push(variant.id);
		byVersion.set(variant.version, ids);
	}

	const versionOps = (custom: boolean | undefined): UpdatePlanOp[] =>
		Array.from(byVersion.entries()).map(([version, ids]) => ({
			type: "update_plan",
			plan_filter: {
				plan_id: ids.length === 1 ? ids[0] : { $in: ids },
				...(custom === undefined ? {} : { custom }),
			},
			version,
		}));

	const operations: Operations = {
		customer: includeCustom ? versionOps(undefined) : versionOps(false),
	};

	return {
		id: `plan-migrate-${planIds.length}-${migrationUid()}`,
		filter: { customer: { plan: planFilter } },
		operations,
		no_billing_changes: !hasPricingChange,
	};
}

export function buildAllVersionsUpdateMigrationDraft({
	targets,
	hasPricingChange,
	includeCustom = false,
}: {
	targets: AllVersionsUpdateMigrationTarget[];
	hasPricingChange: boolean;
	includeCustom?: boolean;
}): MigrationDraft | null {
	const ops = targets.flatMap((target): UpdatePlanOp[] => {
		if (!target.customize) return [];
		const customize = getMigratablePlanDiff(target.customize);
		if (Object.keys(customize).length === 0) return [];

		const op = (custom: boolean | undefined): UpdatePlanOp => ({
			type: "update_plan",
			plan_filter: {
				plan_id: target.id,
				...(custom === undefined ? {} : { custom }),
			},
			customize,
		});

		return [op(includeCustom ? undefined : false)];
	});
	if (ops.length === 0) return null;

	const planIds = [...new Set(targets.map((target) => target.id))];
	const planMatcher = planIds.length === 1 ? planIds[0] : { $in: planIds };
	const basePlanFilter = { plan_id: planMatcher };

	return {
		id: `plan-update-all-${planIds.length}-${migrationUid()}`,
		filter: {
			customer: {
				plan: includeCustom
					? basePlanFilter
					: { ...basePlanFilter, custom: false },
			},
		},
		operations: { customer: ops },
		no_billing_changes: !hasPricingChange,
	};
}
