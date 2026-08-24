import type {
	ApiPlanLicenseV1,
	ApiPlanV1,
	CreatePlanItemParamsV1,
	PlanItemFilter,
} from "@autumn/shared";
import {
	composeMatchKey,
	type DiffablePlanV1,
	type DiffedCustomizePlanV1,
} from "./diffPlanV1.js";

export type ApplyDiffOutput = {
	price: ApiPlanV1["price"];
	items: ApiPlanV1["items"];
	free_trial: ApiPlanV1["free_trial"];
	licenses?: ApiPlanLicenseV1[];
};

type ApiPlanItem = ApiPlanV1["items"][number];
type ApiPlanItemPrice = NonNullable<ApiPlanItem["price"]>;
type ApiPlanItemRollover = NonNullable<ApiPlanItem["rollover"]>;

const applyPrice = (
	base: ApiPlanV1["price"],
	diff: DiffedCustomizePlanV1["price"],
): ApiPlanV1["price"] => {
	if (diff === undefined) return base;
	if (diff === null) return null;
	return { ...diff };
};

const itemMatchesFilter = (
	item: ApiPlanItem | CreatePlanItemParamsV1,
	filter: PlanItemFilter,
): boolean => {
	if (filter.feature_id !== undefined && item.feature_id !== filter.feature_id)
		return false;
	// Omitted billing_method is a wildcard — same rule as the engine's
	// matchesPlanItemFilter, so a feature_id-only filter matches priced items.
	if (
		filter.billing_method !== undefined &&
		item.price?.billing_method !== filter.billing_method
	) {
		return false;
	}
	if (filter.interval !== undefined) {
		const itemInterval = item.price?.interval ?? item.reset?.interval;
		if (String(itemInterval) !== String(filter.interval)) return false;
	}
	if (filter.interval_count !== undefined) {
		const itemCount = item.price?.interval_count ?? item.reset?.interval_count;
		if ((itemCount ?? 1) !== filter.interval_count) return false;
	}
	return true;
};

const removeItems = (
	items: ApiPlanV1["items"],
	removeFilters: PlanItemFilter[],
): ApiPlanV1["items"] => {
	return items.filter(
		(item) => !removeFilters.some((filter) => itemMatchesFilter(item, filter)),
	);
};

const toApiPlanItemPrice = (
	price: CreatePlanItemParamsV1["price"],
): ApiPlanItemPrice | null => {
	if (!price) return null;

	return {
		...price,
		billing_units: price.billing_units ?? 1,
		max_purchase: price.max_purchase ?? null,
	};
};

const toApiPlanItemRollover = (
	rollover: CreatePlanItemParamsV1["rollover"],
): ApiPlanItemRollover | undefined => {
	if (!rollover) return undefined;

	return {
		...rollover,
		max: rollover.max ?? null,
	};
};

const toApiPlanItem = (params: CreatePlanItemParamsV1): ApiPlanItem => {
	return {
		...params,
		included: params.included ?? 0,
		unlimited: params.unlimited ?? false,
		reset: params.reset ?? null,
		price: toApiPlanItemPrice(params.price),
		rollover: toApiPlanItemRollover(params.rollover),
	} as ApiPlanItem;
};

const isFreeNonResetEntitlement = (
	item: ApiPlanItem | CreatePlanItemParamsV1,
): boolean => item.price == null && item.reset == null;

const applyItems = (
	baseItems: ApiPlanV1["items"],
	diff: DiffedCustomizePlanV1,
): ApiPlanV1["items"] => {
	let items = [...baseItems];
	if (diff.remove_items) {
		items = removeItems(items, diff.remove_items);
	}
	if (diff.add_items) {
		const entitlementKeys = new Set<string>();
		for (const item of items) {
			if (isFreeNonResetEntitlement(item)) {
				entitlementKeys.add(composeMatchKey(item));
			}
		}

		for (const addItem of diff.add_items) {
			const key = composeMatchKey(addItem);
			if (isFreeNonResetEntitlement(addItem) && entitlementKeys.has(key)) {
				continue;
			}

			items.push(toApiPlanItem(addItem));
			if (isFreeNonResetEntitlement(addItem)) {
				entitlementKeys.add(key);
			}
		}
	}
	return items;
};

/** applyItems in CreatePlanItemParams space — same remove/add semantics,
 * without ApiPlan normalization. */
export const applyPlanItemParamsDiff = ({
	items,
	add_items,
	remove_items,
}: {
	items: CreatePlanItemParamsV1[];
	add_items?: CreatePlanItemParamsV1[];
	remove_items?: PlanItemFilter[];
}): CreatePlanItemParamsV1[] => {
	let next = [...items];
	if (remove_items) {
		next = next.filter(
			(item) => !remove_items.some((filter) => itemMatchesFilter(item, filter)),
		);
	}
	if (add_items) {
		const entitlementKeys = new Set(
			next.filter(isFreeNonResetEntitlement).map(composeMatchKey),
		);
		for (const addItem of add_items) {
			if (isFreeNonResetEntitlement(addItem)) {
				const key = composeMatchKey(addItem);
				if (entitlementKeys.has(key)) continue;
				entitlementKeys.add(key);
			}
			next.push(addItem);
		}
	}
	return next;
};

/** applyItems only guards free entitlements; replaying a diff onto a drifted
 * plan can collide priced slots too. First occurrence (the base plan's) wins. */
export const dedupeItemsByMatchKey = (
	items: ApiPlanV1["items"],
): ApiPlanV1["items"] => {
	const seen = new Set<string>();
	return items.filter((item) => {
		const key = composeMatchKey(item);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

const applyFreeTrial = (
	base: ApiPlanV1["free_trial"],
	diff: DiffedCustomizePlanV1["free_trial"],
): ApiPlanV1["free_trial"] => {
	if (diff === undefined) return base;
	if (diff === null) return undefined;
	return { ...diff } as ApiPlanV1["free_trial"];
};

const applyLicenseUpsert = ({
	existing,
	upsert,
}: {
	existing?: ApiPlanLicenseV1;
	upsert: NonNullable<DiffedCustomizePlanV1["upsert_licenses"]>[number];
}): ApiPlanLicenseV1 => {
	const customize =
		upsert.customize === null
			? undefined
			: (upsert.customize ?? existing?.customize);

	return {
		license_plan_id: upsert.license_plan_id,
		version: existing?.version ?? 1,
		included: upsert.included ?? existing?.included ?? 0,
		prepaid_only: upsert.prepaid_only ?? existing?.prepaid_only ?? false,
		...(customize !== undefined ? { customize } : {}),
		...(existing?.plan !== undefined ? { plan: existing.plan } : {}),
	};
};

/** Only emit `licenses` when the diff has a license lane — content-only
 * round-trips must not grow a licenses key. */
const applyLicenses = ({
	base,
	diff,
}: {
	base: DiffablePlanV1;
	diff: DiffedCustomizePlanV1;
}): ApiPlanLicenseV1[] | undefined => {
	if (
		diff.upsert_licenses === undefined &&
		diff.remove_licenses === undefined
	) {
		return undefined;
	}

	const removed = new Set(
		(diff.remove_licenses ?? []).map((entry) => entry.license_plan_id),
	);
	const pending = new Map(
		(diff.upsert_licenses ?? []).map((entry) => [entry.license_plan_id, entry]),
	);

	const next: ApiPlanLicenseV1[] = [];
	for (const license of base.licenses ?? []) {
		if (removed.has(license.license_plan_id)) continue;
		const upsert = pending.get(license.license_plan_id);
		if (upsert) {
			next.push(applyLicenseUpsert({ existing: license, upsert }));
			pending.delete(license.license_plan_id);
			continue;
		}
		next.push(license);
	}

	for (const upsert of diff.upsert_licenses ?? []) {
		if (!pending.has(upsert.license_plan_id)) continue;
		next.push(applyLicenseUpsert({ upsert }));
	}

	return next;
};

export const applyDiff = ({
	base,
	diff,
}: {
	base: DiffablePlanV1;
	diff: DiffedCustomizePlanV1;
}): ApplyDiffOutput => {
	const output: ApplyDiffOutput = {
		price: applyPrice(base.price, diff.price),
		items: applyItems(base.items, diff),
		free_trial: applyFreeTrial(base.free_trial, diff.free_trial),
	};
	const licenses = applyLicenses({ base, diff });
	if (licenses === undefined) return output;
	return { ...output, licenses };
};

/** Public customize (PUT `items` or PATCH add/remove) applied onto a plan. */
export const applyCustomizeToPlan = ({
	plan,
	customize,
}: {
	plan: DiffablePlanV1;
	customize: {
		price?: DiffedCustomizePlanV1["price"];
		items?: CreatePlanItemParamsV1[];
		add_items?: CreatePlanItemParamsV1[];
		remove_items?: PlanItemFilter[];
		free_trial?: DiffedCustomizePlanV1["free_trial"];
		upsert_licenses?: DiffedCustomizePlanV1["upsert_licenses"];
		remove_licenses?: DiffedCustomizePlanV1["remove_licenses"];
	};
}): DiffablePlanV1 => {
	const applied = applyDiff({
		base: plan,
		diff: {
			...(customize.price !== undefined ? { price: customize.price } : {}),
			...(customize.add_items !== undefined
				? { add_items: customize.add_items }
				: {}),
			...(customize.remove_items !== undefined
				? { remove_items: customize.remove_items }
				: {}),
			...(customize.free_trial !== undefined
				? { free_trial: customize.free_trial }
				: {}),
			...(customize.upsert_licenses !== undefined
				? { upsert_licenses: customize.upsert_licenses }
				: {}),
			...(customize.remove_licenses !== undefined
				? { remove_licenses: customize.remove_licenses }
				: {}),
		},
	});
	return {
		...plan,
		price: applied.price,
		items:
			customize.items !== undefined
				? customize.items.map(toApiPlanItem)
				: applied.items,
		free_trial: applied.free_trial,
		...(applied.licenses !== undefined ? { licenses: applied.licenses } : {}),
	};
};
