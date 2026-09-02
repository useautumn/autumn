import {
	formatValidationErrors,
	validateConfig,
} from "../../../atmn/src/commands/push/validate.ts";
import type { Plan } from "../../../atmn/src/compose/index.ts";
import type { PlanItem } from "../../../atmn/src/compose/models/planModels.ts";
import type { PlanItemFilter } from "../../../atmn/src/compose/models/variantModels.ts";
import { loadConfig } from "../../../atmn/src/lib/config/loadConfig.ts";
import { transformPlanToApi } from "../../../atmn/src/lib/transforms/sdkToApi/plan.ts";
import type { InspectedConfig } from "./types/inspectedConfig.ts";

const itemMatchesFilter = (item: PlanItem, filter: PlanItemFilter): boolean => {
	if (filter.featureId !== undefined && item.featureId !== filter.featureId)
		return false;
	const price = item.price as
		| { billingMethod?: string; interval?: string; intervalCount?: number }
		| undefined;
	if (
		filter.billingMethod !== undefined &&
		price?.billingMethod !== filter.billingMethod
	)
		return false;
	if (filter.interval !== undefined) {
		const interval = price?.interval ?? item.reset?.interval;
		if (interval !== filter.interval) return false;
	}
	if (filter.intervalCount !== undefined) {
		const intervalCount =
			price?.intervalCount ?? item.reset?.intervalCount ?? 1;
		if (intervalCount !== filter.intervalCount) return false;
	}
	return true;
};

/** Variants are real plans to the grader: apply the stored customize diff
 * (price, removeItems, addItems, …) onto the parent so `pro.variant({...})`
 * and a standalone plan grade alike. */
const materializeVariants = (
	plans: Plan[],
): { plans: Plan[]; variantPlanIds: string[] } => {
	const variantPlanIds: string[] = [];
	const materialized = plans.flatMap((plan) => [
		plan,
		...(plan.variants ?? []).map((variant): Plan => {
			variantPlanIds.push(variant.id);
			const customize = variant.customize ?? {};
			let items = customize.items ?? plan.items ?? [];
			if (customize.removeItems) {
				items = items.filter(
					(item) =>
						!customize.removeItems?.some((filter) =>
							itemMatchesFilter(item, filter),
						),
				);
			}
			if (customize.addItems) items = [...items, ...customize.addItems];
			return {
				...plan,
				id: variant.id,
				name: variant.name,
				variants: undefined,
				items,
				...(customize.price !== undefined && {
					price: customize.price ?? undefined,
				}),
				...(customize.freeTrial !== undefined && {
					freeTrial: customize.freeTrial,
				}),
			};
		}),
	]);
	return { plans: materialized, variantPlanIds };
};

/**
 * Bun entrypoint: `bun inspectWorkspaceConfigScript.ts <workspaceDir>`.
 * Runs out-of-process so atmn internals (jiti, import.meta) never enter the
 * braintrust CLI's CJS eval bundle. Prints InspectedConfig as JSON.
 */
const inspect = async (workspaceDir: string): Promise<InspectedConfig> => {
	try {
		const config = await loadConfig({ cwd: workspaceDir });
		const validation = validateConfig(config.features, config.plans);
		const { plans, variantPlanIds } = materializeVariants(config.plans);
		return {
			configFound: true,
			validationErrors: validation.valid
				? undefined
				: formatValidationErrors(validation.errors).split("\n"),
			plans: plans.map((plan) => transformPlanToApi(plan)),
			variantPlanIds,
			features: config.features.map((feature) => ({
				id: feature.id,
				type: feature.type,
			})),
		};
	} catch (error) {
		return {
			configFound: true,
			plans: [],
			features: [],
			parseError: error instanceof Error ? error.message : String(error),
		};
	}
};

const workspaceDir = process.argv[2];
if (!workspaceDir) throw new Error("usage: inspectWorkspaceConfigScript <dir>");
console.log(JSON.stringify(await inspect(workspaceDir)));
