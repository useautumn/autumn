import type {
	GenerateBillingTool,
	GeneratedBillingParams,
} from "../generationSchemas";
import type { GenerationContext } from "../setup/setupGenerationContext";

type GenerationPlanItem = GenerationContext["plans"][number]["items"][number];

const targetPlanId = ({
	context,
	customerProductId,
	planId,
	tool,
}: {
	context: GenerationContext;
	customerProductId?: string;
	planId?: string;
	tool: GenerateBillingTool;
}): string | undefined => {
	if (planId !== undefined) return planId;
	if (tool === "attach") return undefined;
	const currentPlans = context.customer.current_plans;
	const anchored = currentPlans.find(
		(plan) =>
			customerProductId !== undefined &&
			plan.customer_product_id === customerProductId,
	);
	if (anchored) return anchored.plan_id;
	return currentPlans.length === 1 ? currentPlans[0]?.plan_id : undefined;
};

const itemIsPriced = (item: GenerationPlanItem): boolean =>
	"price" in item && item.price != null;

export const assertNoDuplicateAddItems = ({
	context,
	customerProductId,
	generated,
	tool,
}: {
	context: GenerationContext;
	customerProductId?: string;
	generated: GeneratedBillingParams;
	tool: GenerateBillingTool;
}): void => {
	if (!("customize" in generated) || !generated.customize) return;
	const { add_items: addItems, remove_items: removeFilters } =
		generated.customize;
	if (!addItems?.length) return;

	const planId = targetPlanId({
		context,
		customerProductId,
		planId: generated.plan_id,
		tool,
	});
	const baseItems = context.plans.find((plan) => plan.id === planId)?.items;
	if (!baseItems) return;

	const removedFeatureIds = new Set(
		(removeFilters ?? [])
			.map((filter) => filter.feature_id)
			.filter((id): id is string => id !== undefined),
	);
	for (const addItem of addItems) {
		if (removedFeatureIds.has(addItem.feature_id)) continue;
		const addIsPriced = addItem.price != null;
		const duplicates = baseItems.some(
			(item) =>
				item.feature_id === addItem.feature_id &&
				itemIsPriced(item) === addIsPriced,
		);
		if (duplicates) {
			throw new Error(
				`add_items entry for '${addItem.feature_id}' duplicates an item the plan already has — add_items only appends. To change the existing item, pair a remove_items filter matching it with an add_items entry copying its full definition (rollover, pooled, reset, price) with only the requested change.`,
			);
		}
	}
};
