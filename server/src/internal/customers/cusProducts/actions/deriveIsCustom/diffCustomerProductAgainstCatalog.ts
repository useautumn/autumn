import {
	type ApiPlanItemV1,
	type ApiPlanV1,
	type CreatePlanItemParamsV1,
	composeMatchKey,
	cusProductToProduct,
	type DiffablePlanV1,
	diffPlanV1,
	diffPlanV1ItemChanges,
	type Feature,
	type FullCusProduct,
	type FullProduct,
	itemsEqual,
	toBasePriceParams,
	toCreatePlanItemParams,
} from "@autumn/shared";
import { fullProductToApiPlanV1Sync } from "@/internal/catalogV2/actions/buildPlanChange/fullProductToApiPlanV1Sync";
import type {
	CustomerProductCustomDiff,
	CustomizedPlanItem,
	CustomizedPlanLicense,
} from "./types/customerProductCustomDiff";

/** User-controlled fields only, so ids and Stripe processor refs never read as a difference. */
const toComparablePlanItem = (item: ApiPlanItemV1): CreatePlanItemParamsV1 => {
	const params = toCreatePlanItemParams(item);
	if (!params.price) return params;
	const { processors: _processors, ...price } =
		params.price as typeof params.price & { processors?: unknown };
	return { ...params, price };
};

type SameKeyItems = { catalog: ApiPlanItemV1[]; customer: ApiPlanItemV1[] };

const pairSameKeyItems = ({
	catalog,
	customer,
}: SameKeyItems): CustomizedPlanItem[] => {
	const unmatchedCustomer = [...customer];
	const changedCatalog = catalog.filter((catalogItem) => {
		const match = unmatchedCustomer.findIndex((customerItem) =>
			itemsEqual(catalogItem, customerItem),
		);
		if (match === -1) return true;
		unmatchedCustomer.splice(match, 1);
		return false;
	});

	return Array.from(
		{ length: Math.max(changedCatalog.length, unmatchedCustomer.length) },
		(_, index) => {
			const catalogItem = changedCatalog[index];
			const customerItem = unmatchedCustomer[index];
			return {
				feature_id: (catalogItem ?? customerItem).feature_id,
				catalog: catalogItem ? toComparablePlanItem(catalogItem) : null,
				customer: customerItem ? toComparablePlanItem(customerItem) : null,
			};
		},
	);
};

const pairCustomizedPlanItems = ({
	catalog,
	customer,
}: {
	catalog: ApiPlanV1;
	customer: ApiPlanV1;
}): CustomizedPlanItem[] => {
	const itemsByKey = new Map<string, SameKeyItems>();

	for (const change of diffPlanV1ItemChanges({ from: catalog, to: customer })) {
		const key = composeMatchKey(change.item);
		const sameKey = itemsByKey.get(key) ?? { catalog: [], customer: [] };
		itemsByKey.set(key, sameKey);
		const side =
			change.action === "deleted" ? sameKey.catalog : sameKey.customer;
		side.push(change.item);
	}

	return [...itemsByKey.values()].flatMap(pairSameKeyItems);
};

/** Every customer on a version shares the catalog side, so it converts once per loaded product. */
const catalogPlans = new WeakMap<FullProduct, ApiPlanV1>();

const catalogPlanFor = ({
	baseProduct,
	features,
}: {
	baseProduct: FullProduct;
	features: Feature[];
}): ApiPlanV1 => {
	const cached = catalogPlans.get(baseProduct);
	if (cached) return cached;
	const plan = fullProductToApiPlanV1Sync({ product: baseProduct, features });
	catalogPlans.set(baseProduct, plan);
	return plan;
};

const pairCustomizedPlanLicenses = ({
	catalog,
	customer,
	changedLicensePlanIds,
}: {
	catalog: DiffablePlanV1;
	customer: DiffablePlanV1;
	changedLicensePlanIds: string[];
}): CustomizedPlanLicense[] =>
	[...new Set(changedLicensePlanIds)].map((licensePlanId) => ({
		license_plan_id: licensePlanId,
		catalog:
			catalog.licenses?.find(
				(license) => license.license_plan_id === licensePlanId,
			) ?? null,
		customer:
			customer.licenses?.find(
				(license) => license.license_plan_id === licensePlanId,
			) ?? null,
	}));

/** Free trials and product-level details never count. */
export const diffCustomerProductAgainstCatalog = ({
	customerProduct,
	baseProduct,
	features,
}: {
	customerProduct: FullCusProduct;
	baseProduct: FullProduct;
	features: Feature[];
}): CustomerProductCustomDiff | null => {
	const catalog = catalogPlanFor({ baseProduct, features });
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
	const licenses = pairCustomizedPlanLicenses({
		catalog,
		customer,
		changedLicensePlanIds: [
			...(planDiff.upsert_licenses ?? []),
			...(planDiff.remove_licenses ?? []),
		].map(({ license_plan_id }) => license_plan_id),
	});

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
		...(licenses.length > 0 ? { licenses } : {}),
	};

	return Object.keys(diff).length > 0 ? diff : null;
};
