import type { Product, UpdateCatalogPlanParams } from "@autumn/shared";

/**
 * Only-provided detail columns as a row patch.
 * Owns the `is_default` ?? `auto_enable` precedence (same rule as the shared
 * planParamsV1ToProductV2 mapper) and the partial-config merge.
 */
export const planParamsToProductRowPatch = ({
	planParams,
	current,
}: {
	planParams: UpdateCatalogPlanParams;
	current: Product | null;
}): Partial<Product> => {
	const patch: Partial<Product> = {};

	if (planParams.new_plan_id !== undefined) patch.id = planParams.new_plan_id;
	if (planParams.name !== undefined) patch.name = planParams.name;
	if (planParams.description !== undefined) {
		patch.description = planParams.description;
	}
	if (planParams.group !== undefined) patch.group = planParams.group;
	if (planParams.add_on !== undefined) patch.is_add_on = planParams.add_on;
	if (planParams.is_default !== undefined) {
		patch.is_default = planParams.is_default;
	} else if (planParams.auto_enable !== undefined) {
		patch.is_default = planParams.auto_enable;
	}
	if (planParams.archived !== undefined) patch.archived = planParams.archived;
	if (planParams.config !== undefined) {
		patch.config = {
			ignore_past_due:
				planParams.config.ignore_past_due ??
				current?.config?.ignore_past_due ??
				false,
		};
	}
	if (planParams.metadata !== undefined) patch.metadata = planParams.metadata;

	return patch;
};
