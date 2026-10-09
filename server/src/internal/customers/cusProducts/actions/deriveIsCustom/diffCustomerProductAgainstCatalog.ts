import {
	type ApiPlanItemV1,
	type ApiPlanV1,
	type CreatePlanItemParamsV1,
	composeMatchKey,
	cusProductToProduct,
	diffPlanV1,
	diffPlanV1ItemChanges,
	type Feature,
	type FullCusProduct,
	type FullProduct,
	toBasePriceParams,
	toCreatePlanItemParams,
} from "@autumn/shared";
import { fullProductToApiPlanV1Sync } from "@/internal/catalogV2/actions/buildPlanChange/fullProductToApiPlanV1Sync";
import type {
	CustomerProductCustomDiff,
	CustomizedPlanItem,
} from "./types/customerProductCustomDiff";

/** User-controlled fields only, so ids and Stripe processor refs never read as a difference. */
const toComparablePlanItem = (item: ApiPlanItemV1): CreatePlanItemParamsV1 => {
	const params = toCreatePlanItemParams(item);
	if (!params.price) return params;
	const { processors: _processors, ...price } =
		params.price as typeof params.price & { processors?: unknown };
	return { ...params, price };
};

/** Pairs a removed catalog item with the added customer item of the same identity, so an edit reads as one change. */
const pairCustomizedPlanItems = ({
	catalog,
	customer,
}: {
	catalog: ApiPlanV1;
	customer: ApiPlanV1;
}): CustomizedPlanItem[] => {
	const itemsByKey = new Map<string, CustomizedPlanItem[]>();

	for (const change of diffPlanV1ItemChanges({ from: catalog, to: customer })) {
		const key = composeMatchKey(change.item);
		const sameKey = itemsByKey.get(key) ?? [];
		itemsByKey.set(key, sameKey);

		if (change.action === "deleted") {
			sameKey.push({
				feature_id: change.feature_id,
				catalog: toComparablePlanItem(change.item),
				customer: null,
			});
			continue;
		}

		const unpaired = sameKey.find((item) => item.customer === null);
		if (unpaired) {
			unpaired.customer = toComparablePlanItem(change.item);
			continue;
		}
		sameKey.push({
			feature_id: change.feature_id,
			catalog: null,
			customer: toComparablePlanItem(change.item),
		});
	}

	return [...itemsByKey.values()].flat();
};

/**
 * Diffs a customer product against the catalog version it points at, keeping
 * only what makes it custom. Free trials and product-level details never count.
 */
export const diffCustomerProductAgainstCatalog = ({
	customerProduct,
	baseProduct,
	features,
}: {
	customerProduct: FullCusProduct;
	baseProduct: FullProduct;
	features: Feature[];
}): CustomerProductCustomDiff | null => {
	const catalog = fullProductToApiPlanV1Sync({
		product: baseProduct,
		features,
	});
	const customer = fullProductToApiPlanV1Sync({
		product: cusProductToProduct({ cusProduct: customerProduct }),
		features,
	});

	const planDiff = diffPlanV1({
		from: catalog,
		to: customer,
		includeAdds: true,
	});
	const items = pairCustomizedPlanItems({ catalog, customer });

	const diff: CustomerProductCustomDiff = {
		...(planDiff.price !== undefined
			? {
					price: {
						catalog: catalog.price && toBasePriceParams(catalog.price),
						customer: customer.price && toBasePriceParams(customer.price),
					},
				}
			: {}),
		...(items.length > 0 ? { items } : {}),
		...(planDiff.upsert_licenses
			? { upsert_licenses: planDiff.upsert_licenses }
			: {}),
		...(planDiff.remove_licenses
			? { remove_licenses: planDiff.remove_licenses }
			: {}),
	};

	return Object.keys(diff).length > 0 ? diff : null;
};
