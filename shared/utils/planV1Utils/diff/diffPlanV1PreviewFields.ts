import type { ApiPlanV1 } from "@api/products/apiPlanV1.js";
import type { CorePlanUpdatePreview } from "@api/products/previewUpdatePlan/components/corePlanUpdatePreview.js";
import type { PlanUpdatePreviewItemChange } from "@api/products/previewUpdatePlan/components/planUpdatePreviewChanges.js";
import {
	composeMatchKey,
	diffPlanV1,
	planItemFilterMatchKey,
} from "./diffPlanV1.js";

const previousAttributeKeys = [
	"id",
	"name",
	"description",
	"group",
	"add_on",
	"auto_enable",
	"free_trial",
	"config",
	"billing_controls",
] as const satisfies readonly (keyof ApiPlanV1)[];

const valuesEqual = (left: unknown, right: unknown): boolean => {
	if (left == null || right == null) return left == null && right == null;
	if (Object.is(left, right)) return true;
	if (typeof left !== typeof right) return false;

	if (Array.isArray(left) || Array.isArray(right)) {
		if (!Array.isArray(left) || !Array.isArray(right)) return false;
		if (left.length !== right.length) return false;
		return left.every((entry, index) => valuesEqual(entry, right[index]));
	}

	if (typeof left === "object") {
		const leftRecord = left as Record<string, unknown>;
		const rightRecord = right as Record<string, unknown>;
		const leftKeys = Object.keys(leftRecord).filter(
			(key) => leftRecord[key] !== undefined,
		);
		const rightKeys = Object.keys(rightRecord).filter(
			(key) => rightRecord[key] !== undefined,
		);

		if (leftKeys.length !== rightKeys.length) return false;
		return leftKeys.every(
			(key) =>
				Object.prototype.hasOwnProperty.call(rightRecord, key) &&
				valuesEqual(leftRecord[key], rightRecord[key]),
		);
	}

	return false;
};

export const planUpdatePreviewHasDiff = ({
	customize,
	previous_attributes,
	price_change,
	item_changes,
}: Pick<
	CorePlanUpdatePreview,
	"customize" | "previous_attributes" | "price_change" | "item_changes"
>): boolean =>
	Boolean(
		customize ||
			previous_attributes ||
			price_change ||
			item_changes.length > 0,
	);

export const diffPlanV1PreviousAttributes = ({
	from,
	to,
}: {
	from: ApiPlanV1;
	to: ApiPlanV1;
}): CorePlanUpdatePreview["previous_attributes"] => {
	const previous: Record<string, unknown> = {};

	for (const key of previousAttributeKeys) {
		if (!valuesEqual(from[key], to[key])) {
			previous[key] = from[key];
		}
	}

	return Object.keys(previous).length > 0 ? previous : null;
};

export const diffPlanV1ItemChanges = ({
	from,
	to,
}: {
	from: ApiPlanV1;
	to: ApiPlanV1;
}): PlanUpdatePreviewItemChange[] => {
	const diff = diffPlanV1({ from, to });
	const addedKeys = new Set((diff.add_items ?? []).map(composeMatchKey));
	const removedKeys = new Set(
		(diff.remove_items ?? []).map(planItemFilterMatchKey),
	);

	return [
		...from.items
			.filter((item) => removedKeys.has(composeMatchKey(item)))
			.map((item) => ({
				action: "deleted" as const,
				feature_id: item.feature_id,
				item,
			})),
		...to.items
			.filter((item) => addedKeys.has(composeMatchKey(item)))
			.map((item) => ({
				action: "created" as const,
				feature_id: item.feature_id,
				item,
			})),
	];
};

export const diffPlanV1PreviewFields = ({
	from,
	to,
}: {
	from: ApiPlanV1;
	to: ApiPlanV1;
}): Pick<
	CorePlanUpdatePreview,
	"customize" | "previous_attributes" | "price_change" | "item_changes"
> => {
	const customize = diffPlanV1({ from, to });

	return {
		customize: Object.keys(customize).length > 0 ? customize : null,
		previous_attributes: diffPlanV1PreviousAttributes({ from, to }),
		...(customize.price !== undefined
			? {
					price_change: {
						previous: from.price,
						current: to.price,
					},
				}
			: {}),
		item_changes: diffPlanV1ItemChanges({ from, to }),
	};
};
