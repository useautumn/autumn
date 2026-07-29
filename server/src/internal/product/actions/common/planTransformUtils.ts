import {
	type ApiPlanV1,
	apiPlan,
	applyDiff,
	composeMatchKey,
	type DiffedCustomizePlanV1,
	diffPlanV1,
	type FullProduct,
	type UpdatePlanParams,
	type UpdateProductV2Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";

export type VariantSettingsPatch = Partial<
	Pick<
		ApiPlanV1,
		| "name"
		| "description"
		| "group"
		| "add_on"
		| "config"
		| "billing_controls"
		| "metadata"
	>
>;

const variantSettingKeys = [
	"name",
	"description",
	"group",
	"add_on",
	"config",
	"billing_controls",
	"metadata",
] as const satisfies readonly (keyof VariantSettingsPatch)[];

const valuesEqual = (a: unknown, b: unknown) =>
	JSON.stringify(a) === JSON.stringify(b);

export const fullProductToApiPlanV1 = ({
	ctx,
	product,
}: {
	ctx: AutumnContext;
	product: FullProduct;
}): Promise<ApiPlanV1> =>
	getPlanResponse({
		ctx,
		product,
		features: ctx.features,
	});

// Row ids on a plan response belong to the source product; strip them whenever
// the plan seeds a different product so it mints its own entitlement/price rows.
export const stripPlanRowIds = ({ plan }: { plan: ApiPlanV1 }): ApiPlanV1 => ({
	...plan,
	price: plan.price
		? (({ entitlement_id: _entitlementId, price_id: _priceId, ...rest }) =>
				rest)(plan.price)
		: plan.price,
	items: plan.items.map(
		({ entitlement_id: _entitlementId, price_id: _priceId, ...rest }) => rest,
	),
});

export const getApiPlanDiff = ({
	from,
	to,
}: {
	from: ApiPlanV1;
	to: ApiPlanV1;
}): DiffedCustomizePlanV1 => diffPlanV1({ from, to });

export const getVariantSettingsPatch = ({
	from,
	to,
}: {
	from: ApiPlanV1;
	to: ApiPlanV1;
}): VariantSettingsPatch => {
	const patch: VariantSettingsPatch = {};

	for (const key of variantSettingKeys) {
		if (!valuesEqual(from[key], to[key])) {
			patch[key] = to[key] as never;
		}
	}

	return patch;
};

// Variants own their name; base→variant propagation must never overwrite it.
// Same-plan version propagation still uses the full patch, name included.
export const omitVariantOwnedSettings = ({
	name: _name,
	...rest
}: VariantSettingsPatch): VariantSettingsPatch => rest;

const hasVariantSettingsPatch = (patch: VariantSettingsPatch): boolean =>
	Object.keys(patch).length > 0;

const dedupeItemsByMatchKey = (
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

export const applyDiffToVariantPlan = ({
	plan,
	diff,
	settingsPatch = {},
}: {
	plan: ApiPlanV1;
	diff: DiffedCustomizePlanV1;
	settingsPatch?: VariantSettingsPatch;
}): ApiPlanV1 => {
	const reconstructed = applyDiff({
		base: plan,
		diff,
	});

	return {
		...plan,
		...reconstructed,
		...settingsPatch,
		items: dedupeItemsByMatchKey(reconstructed.items),
	};
};

export const buildProductUpdatesFromApiPlan = ({
	ctx,
	currentFullProduct,
	plan,
}: {
	ctx: AutumnContext;
	currentFullProduct: FullProduct;
	plan: ApiPlanV1;
}): UpdateProductV2Params =>
	apiPlan.map.paramsV1ToProductV2({
		ctx,
		currentFullProduct,
		params: {
			id: currentFullProduct.id,
			name: plan.name,
			description: plan.description,
			group: plan.group ?? "",
			add_on: plan.add_on,
			items: plan.items,
			price: plan.price,
			free_trial: plan.free_trial,
			config: plan.config,
			billing_controls: plan.billing_controls,
			metadata: plan.metadata,
		} as UpdatePlanParams,
	}) as UpdateProductV2Params;

export const variantSettingsPatchHasValues = hasVariantSettingsPatch;
