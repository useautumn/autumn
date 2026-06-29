import {
	type ApiPlanV1,
	composeMatchKey,
	diffPlanV1,
	type PlanUpdatePreviewItemChange,
	planItemFilterMatchKey,
	type CorePlanUpdatePreview,
	expandPathIncludes,
} from "@autumn/shared";

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

const valuesEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const getPreviousAttributes = ({
	current,
	preview,
}: {
	current: ApiPlanV1;
	preview: ApiPlanV1;
}): CorePlanUpdatePreview["previous_attributes"] => {
	const previous: Record<string, unknown> = {};

	for (const key of previousAttributeKeys) {
		if (!valuesEqual(current[key], preview[key])) {
			previous[key] = current[key];
		}
	}

	return Object.keys(previous).length > 0 ? previous : null;
};

const getItemChanges = ({
	current,
	preview,
}: {
	current: ApiPlanV1;
	preview: ApiPlanV1;
}): PlanUpdatePreviewItemChange[] => {
	const diff = diffPlanV1({ from: current, to: preview });
	const addedKeys = new Set((diff.add_items ?? []).map(composeMatchKey));
	const removedKeys = new Set(
		(diff.remove_items ?? []).map(planItemFilterMatchKey),
	);

	return [
		...current.items
			.filter((item) => removedKeys.has(composeMatchKey(item)))
			.map((item) => ({
				action: "deleted" as const,
				feature_id: item.feature_id,
				item,
			})),
		...preview.items
			.filter((item) => addedKeys.has(composeMatchKey(item)))
			.map((item) => ({
				action: "created" as const,
				feature_id: item.feature_id,
				item,
			})),
	];
};

export const buildCorePlanUpdatePreview = ({
	ctx,
	planId,
	current,
	preview,
	hasCustomers,
	customerCount,
	versionable,
}: {
	ctx: { expand: string[] };
	planId: string;
	current: ApiPlanV1;
	preview: ApiPlanV1;
	hasCustomers: boolean;
	customerCount: number;
	versionable: boolean;
}): CorePlanUpdatePreview => {
	const customize = diffPlanV1({ from: current, to: preview });
	const shouldExpandPlanFromScopedCtx = expandPathIncludes({
		expand: ctx.expand,
		includes: ["plan"],
	});

	return {
		plan_id: planId,
		...(shouldExpandPlanFromScopedCtx ? { plan: preview } : {}),
		has_customers: hasCustomers,
		customer_count: customerCount,
		versionable,
		customize: Object.keys(customize).length > 0 ? customize : null,
		previous_attributes: getPreviousAttributes({ current, preview }),
		...(customize.price !== undefined
			? {
					price_change: {
						previous: current.price,
						current: preview.price,
					},
				}
			: {}),
		item_changes: getItemChanges({ current, preview }),
	};
};
