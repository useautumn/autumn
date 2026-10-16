type PlanUpdateIds = {
	plan_id?: unknown;
	new_plan_id?: unknown;
	update_variant_ids?: unknown;
	variants?: unknown;
	update_license_parents?: unknown;
};

const asArray = (value: unknown): unknown[] =>
	Array.isArray(value) ? value : [];

const field = (value: unknown, key: string): unknown =>
	value && typeof value === "object"
		? (value as Record<string, unknown>)[key]
		: undefined;

/** Every plan a plan update writes: itself, its rename, and the variants and license parents it propagates to. */
export const planUpdateToEditedPlanIds = (update: PlanUpdateIds): unknown[] => [
	update.plan_id,
	update.new_plan_id,
	...asArray(update.update_variant_ids),
	...asArray(update.variants).flatMap((variant) => [
		field(variant, "variant_plan_id"),
		field(variant, "new_plan_id"),
	]),
	...asArray(update.update_license_parents).map((parent) =>
		field(parent, "plan_id"),
	),
];
