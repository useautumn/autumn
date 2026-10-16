/** The id fields a plan update names, from `plans.update` or a catalog plan. */
export type PlanUpdateIds = {
	plan_id: string;
	new_plan_id?: string;
	update_variant_ids?: string[];
	variants?: { variant_plan_id: string }[];
	update_license_parents?: { plan_id: string }[];
};

/** Every plan a plan update writes: itself, its rename, and the variants and license parents it propagates to. */
export const planUpdateToEditedPlanIds = ({
	params,
}: {
	params: PlanUpdateIds;
}): string[] => [
	params.plan_id,
	...(params.new_plan_id ? [params.new_plan_id] : []),
	...(params.update_variant_ids ?? []),
	...(params.variants ?? []).map(({ variant_plan_id }) => variant_plan_id),
	...(params.update_license_parents ?? []).map(({ plan_id }) => plan_id),
];
