import type { CreatePlanItemParamsV1, PlanItemFilter } from "@autumn/shared";
import type { GeneratedBillingParams } from "../generationSchemas";
import type { GenerationContext } from "../setup/setupGenerationContext";

type PlanCustomization = {
	planId: string | undefined;
	customize:
		| {
				add_items?: CreatePlanItemParamsV1[];
				remove_items?: PlanItemFilter[];
		  }
		| null
		| undefined;
};

const anchoredPlanId = ({
	context,
	customerProductId,
}: {
	context: GenerationContext;
	customerProductId?: string;
}): string | undefined => {
	const currentPlans = context.customer.current_plans;
	const anchored = currentPlans.find(
		(plan) =>
			customerProductId !== undefined &&
			plan.customer_product_id === customerProductId,
	);
	if (anchored) return anchored.plan_id;
	return currentPlans.length === 1 ? currentPlans[0]?.plan_id : undefined;
};

/** Every generated request normalizes to plan customizations: schedule
 * phases and unscheduled plans, or the primary plan plus additional_plans. */
const planCustomizations = ({
	context,
	customerProductId,
	generated,
}: {
	context: GenerationContext;
	customerProductId?: string;
	generated: GeneratedBillingParams;
}): PlanCustomization[] => {
	if ("phases" in generated) {
		return [
			...generated.phases.flatMap((phase) => phase.plans),
			...(generated.unscheduled_plans ?? []),
		].map((plan) => ({ planId: plan.plan_id, customize: plan.customize }));
	}
	return [
		{
			planId:
				generated.plan_id ?? anchoredPlanId({ context, customerProductId }),
			customize: generated.customize,
		},
		...("additional_plans" in generated
			? (generated.additional_plans ?? []).map((plan) => ({
					planId: plan.plan_id,
					customize: plan.customize,
				}))
			: []),
	];
};

const assertCustomizationAgainstCatalog = ({
	context,
	customization,
}: {
	context: GenerationContext;
	customization: PlanCustomization;
}): void => {
	const { customize, planId } = customization;
	const baseItems = context.plans.find((plan) => plan.id === planId)?.items;
	const addItems = customize?.add_items;
	if (!baseItems || !addItems?.length) return;

	const removedFeatureIds = new Set(
		(customize?.remove_items ?? [])
			.map((filter) => filter.feature_id)
			.filter((id): id is string => id !== undefined),
	);
	for (const addItem of addItems) {
		if (removedFeatureIds.has(addItem.feature_id)) continue;
		const duplicates = baseItems.some(
			(item) =>
				item.feature_id === addItem.feature_id &&
				(item.price != null) === (addItem.price != null),
		);
		if (duplicates) {
			throw new Error(
				`add_items entry for '${addItem.feature_id}' duplicates an item the plan already has — add_items only appends. To change the existing item, pair a remove_items filter matching it with an add_items entry copying its full definition (rollover, pooled, reset, price) with only the requested change.`,
			);
		}
	}
};

export const assertNoDuplicateAddItems = ({
	context,
	customerProductId,
	generated,
}: {
	context: GenerationContext;
	customerProductId?: string;
	generated: GeneratedBillingParams;
}): void => {
	for (const customization of planCustomizations({
		context,
		customerProductId,
		generated,
	})) {
		assertCustomizationAgainstCatalog({ context, customization });
	}
};
