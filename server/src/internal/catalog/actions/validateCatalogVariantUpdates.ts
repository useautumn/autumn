import { ErrCode, RecaseError, type CatalogUpdateParams } from "@autumn/shared";

export const validateCatalogVariantUpdates = ({
	params,
}: {
	params: CatalogUpdateParams;
}) => {
	const planIds = new Set<string>();
	for (const plan of params.plans) {
		planIds.add(plan.plan_id);
		if (plan.new_plan_id) planIds.add(plan.new_plan_id);
	}

	const variantBaseById = new Map<string, string>();
	for (const plan of params.plans) {
		for (const variant of plan.variants ?? []) {
			if (variant.variant_plan_id === plan.plan_id) {
				throw new RecaseError({
					message: `Plan ${plan.plan_id} cannot be updated as its own variant.`,
					code: ErrCode.InvalidPropagationTarget,
					statusCode: 400,
				});
			}

			if (planIds.has(variant.variant_plan_id)) {
				throw new RecaseError({
					message: `Plan ${variant.variant_plan_id} cannot be updated both as a plan and a variant.`,
					code: ErrCode.InvalidPropagationTarget,
					statusCode: 400,
				});
			}

			const existingBase = variantBaseById.get(variant.variant_plan_id);
			if (existingBase) {
				throw new RecaseError({
					message:
						existingBase === plan.plan_id
							? `Variant ${variant.variant_plan_id} cannot be updated more than once.`
							: `Variant ${variant.variant_plan_id} cannot be updated under multiple base plans.`,
					code: ErrCode.InvalidPropagationTarget,
					statusCode: 400,
				});
			}

			variantBaseById.set(variant.variant_plan_id, plan.plan_id);
		}
	}
};
