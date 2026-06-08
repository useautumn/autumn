import type {
	ApiPlanV1,
	Feature,
	FrontendProduct,
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
import type { DiffedCustomizePlanV1 } from "@autumn/shared/utils/planV1Utils/diff/diffPlanV1.js";
import type { MigrationFilter } from "@autumn/shared/api/migrations/filters/migrationFilter.js";
import type { Operations } from "@autumn/shared/api/migrations/operations/operations.js";
import { migrationUid } from "@/views/migrations/migration/shared/operationUtils";

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
	} satisfies ApiPlanV1;
}

function planItemsToUpdateParams(
	items: ApiPlanV1["items"],
): NonNullable<UpdatePlanParamsV2Input["items"]> {
	return items.map(({ feature, display, reset, price, proration, rollover, ...item }) => ({
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
	}));
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
	const plan = frontendProductToApiPlanV1(editedProduct, features);

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
		disable_version: true,
	} satisfies UpdatePlanParamsV2Input;
}

function diffHasBillingChanges(diff: DiffedCustomizePlanV1): boolean {
	if (diff.price !== undefined) return true;
	if (diff.add_items?.some((i) => i.price != null)) return true;
	return false;
}

export type MigrationScope = "this_version" | "all_customers";

export type VersionMigrateScope = "all" | number;

export function buildVersionMigrationDraft({
	productId,
	latestVersion,
	scope,
	pastVersions,
	includeCustom = false,
}: {
	productId: string;
	latestVersion: number;
	scope: VersionMigrateScope;
	pastVersions: number[];
	includeCustom?: boolean;
}): MigrationDraft {
	const versions = scope === "all" ? pastVersions : [scope];
	const versionMatcher =
		versions.length === 1 ? versions[0] : { $in: versions };
	const planFilter = {
		plan_id: productId,
		version: versionMatcher,
		...(!includeCustom ? { custom: false } : {}),
	};

	const filter: MigrationFilter = {
		customer: { plan: planFilter },
	};

	const operations: Operations = {
		customer: [
			{
				type: "update_plan",
				plan_filter: planFilter,
				version: latestVersion,
			},
		],
	} as unknown as Operations;

	const suffix = scope === "all" ? "migrate-all" : `migrate-v${scope}`;

	return {
		id: `${productId}-${suffix}-to-v${latestVersion}-${migrationUid()}`,
		filter,
		operations,
		no_billing_changes: true,
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

	const hasCustomize = Object.keys(diff).length > 0;
	const customize = hasCustomize ? diff : undefined;

	const planFilter = {
		plan_id: baseProduct.id,
		...(scope === "this_version"
			? { version: baseProduct.version }
			: {}),
		...(!includeCustom ? { custom: false } : {}),
	};
	const updatePlanOp = {
		type: "update_plan" as const,
		plan_filter: planFilter,
		...(customize ? { customize } : {}),
	};

	const filter: MigrationFilter = {
		customer: { plan: planFilter },
	};

	const suffix =
		scope === "all_customers" ? "update-all" : "update";

	return {
		id: `${baseProduct.id}-${suffix}-${migrationUid()}`,
		filter,
		operations: { customer: [updatePlanOp] } as unknown as Operations,
		no_billing_changes: !diffHasBillingChanges(diff),
	};
}
