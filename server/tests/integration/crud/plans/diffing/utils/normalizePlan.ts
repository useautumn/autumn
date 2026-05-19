import type { ApiPlanV1 } from "@autumn/shared";
import type { ApplyDiffOutput } from "@autumn/shared/utils/planV1Utils/diff/applyDiff.js";

export const ITEM_FIELDS = [
	"feature_id",
	"included",
	"unlimited",
	"reset",
	"price",
	"rollover",
] as const;

export type ApiPlanItem = ApiPlanV1["items"][number];

export type NormalizablePlan = {
	price: ApiPlanV1["price"];
	items: ApiPlanV1["items"];
	free_trial?: ApiPlanV1["free_trial"];
};

export const normalizeRollover = (rollover: ApiPlanItem["rollover"]) => {
	if (rollover === null || rollover === undefined) return undefined;
	const out: Record<string, unknown> = {
		expiry_duration_type: rollover.expiry_duration_type,
	};
	if (rollover.max != null) out.max = rollover.max;
	if (rollover.max_percentage != null)
		out.max_percentage = rollover.max_percentage;
	if (rollover.expiry_duration_length !== undefined)
		out.expiry_duration_length = rollover.expiry_duration_length;
	return out;
};

export const normalizeItem = (item: ApiPlanItem) => {
	const out: Record<string, unknown> = {};
	for (const k of ITEM_FIELDS) {
		if (k === "rollover") {
			const val = item.rollover;
			if (val !== undefined && val !== null) out[k] = normalizeRollover(val);
		} else {
			const val = item[k];
			// Diff omits nullish fields in create params; treat null == absent.
			if (val !== undefined && val !== null) out[k] = val;
		}
	}
	return out;
};

export const normalizePrice = (price: ApiPlanV1["price"]) => {
	if (price === null || price === undefined) return null;
	const { display: _d, ...rest } = price;
	return rest;
};

export const normalizeFreeTrial = (ft: ApiPlanV1["free_trial"]) => {
	if (ft === null || ft === undefined) return null;
	const out = { ...ft };
	if (out.on_end === null || out.on_end === undefined) delete out.on_end;
	return out;
};

export const normalizePlan = (plan: NormalizablePlan | ApplyDiffOutput) => ({
	price: normalizePrice(plan.price),
	items: [...plan.items]
		.sort((a, b) => {
			const byFeature = a.feature_id.localeCompare(b.feature_id);
			if (byFeature !== 0) return byFeature;
			return (a.included ?? 0) - (b.included ?? 0);
		})
		.map(normalizeItem),
	free_trial: normalizeFreeTrial(plan.free_trial),
});
