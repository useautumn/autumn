import {
	type Product,
	pickBillingControlColumns,
	type UpdateCatalogPlanParams,
} from "@autumn/shared";

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
	// Addressed by internal_id under a different plan_id: the row moves there.
	// Without this the upsert writes the old id back over the rename.
	if (
		planParams.internal_id !== undefined &&
		current !== null &&
		planParams.plan_id !== current.id
	) {
		patch.id = planParams.plan_id;
	}
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
	if (planParams.active !== undefined) patch.active = planParams.active;
	if (planParams.new_version_slug !== undefined) {
		patch.version_slug = planParams.new_version_slug;
	}
	if (planParams.config !== undefined) {
		patch.config = {
			ignore_past_due:
				planParams.config.ignore_past_due ??
				current?.config?.ignore_past_due ??
				false,
		};
	}
	if (planParams.metadata !== undefined) patch.metadata = planParams.metadata;
	if (planParams.billing_controls !== undefined) {
		Object.assign(
			patch,
			pickBillingControlColumns(planParams.billing_controls),
		);
	}

	return patch;
};
