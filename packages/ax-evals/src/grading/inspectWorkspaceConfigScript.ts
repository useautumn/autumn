import type { ApiPlanParams } from "../../../atmn/src/lib/transforms/sdkToApi/plan.ts";
import { configSearchDirs } from "../../../atmn-nightly/src/actions/push.ts";
import { loadConfig } from "../../../atmn-nightly/src/config/loadConfig.ts";
import type { InspectedConfig } from "./types/inspectedConfig.ts";

type WirePlan = {
	plan_id?: string;
	name?: string;
	variants?: WireVariant[];
	items?: Record<string, unknown>[];
	[key: string]: unknown;
};

type WireVariant = {
	variant_plan_id?: string;
	name?: string;
	customize?: {
		price?: unknown;
		items?: Record<string, unknown>[];
		add_items?: Record<string, unknown>[];
		remove_items?: { feature_id?: string }[];
		free_trial?: unknown;
		[key: string]: unknown;
	};
};

const asPlan = (plan: WirePlan): ApiPlanParams =>
	({
		...plan,
		id: String(plan.plan_id ?? ""),
		licenses: (plan.licenses as ApiPlanParams["licenses"]) ?? [],
	}) as ApiPlanParams;

const materializeVariants = (
	plans: WirePlan[],
): { plans: ApiPlanParams[]; variantPlanIds: string[] } => {
	const variantPlanIds: string[] = [];
	const materialized = plans.flatMap((plan) => {
		const parent = asPlan(plan);
		const variants = plan.variants ?? [];
		return [
			parent,
			...variants.map((variant): ApiPlanParams => {
				const id = String(variant.variant_plan_id ?? "");
				variantPlanIds.push(id);
				const customize = variant.customize ?? {};
				let items = customize.items ?? plan.items ?? [];
				if (customize.remove_items) {
					items = items.filter(
						(item) =>
							!customize.remove_items?.some(
								(filter) =>
									filter.feature_id !== undefined &&
									item.feature_id === filter.feature_id,
							),
					);
				}
				if (customize.add_items) items = [...items, ...customize.add_items];
				return {
					...parent,
					id,
					name: variant.name ?? parent.name,
					items,
					...(customize.price !== undefined && {
						price: customize.price as ApiPlanParams["price"],
					}),
					...(customize.free_trial !== undefined && {
						free_trial: customize.free_trial as ApiPlanParams["free_trial"],
					}),
				};
			}),
		];
	});
	return { plans: materialized, variantPlanIds };
};

/**
 * Bun entrypoint: `bun inspectWorkspaceConfigScript.ts <workspaceDir>`.
 * Runs out-of-process so atmn internals never enter the braintrust CJS bundle.
 */
const inspect = async (workspaceDir: string): Promise<InspectedConfig> => {
	try {
		const { wire } = await loadConfig({
			dirs: configSearchDirs({ cwd: workspaceDir }),
		});
		const features = Array.isArray(wire.features)
			? (wire.features as { feature_id?: string; type?: string }[])
			: [];
		const plans = Array.isArray(wire.plans) ? (wire.plans as WirePlan[]) : [];
		const { plans: materialized, variantPlanIds } = materializeVariants(plans);
		return {
			configFound: true,
			plans: materialized,
			variantPlanIds,
			features: features.map((feature) => ({
				id: String(feature.feature_id ?? ""),
				type: String(feature.type ?? ""),
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
