import { expect, test } from "bun:test";
import type { CatalogPlanParams, FullProduct } from "@autumn/shared";
import {
	sortCatalogPlansByDependencies,
	validateCatalogPlanVersionTargets,
} from "@/internal/catalog/actions/catalogPlanDependencies.js";

const plan = (
	plan_id: string,
	version?: number,
	licenses?: CatalogPlanParams["licenses"],
	new_plan_id?: string,
): CatalogPlanParams => ({ plan_id, version, licenses, new_plan_id });

test.concurrent(
	"unpinned dependencies select the highest batch version",
	() => {
		const sorted = sortCatalogPlansByDependencies([
			plan("parent", undefined, [{ license_plan_id: "child" }]),
			plan("child", 2),
			plan("child", 1),
		]);

		expect(
			sorted.map(({ plan_id, version }) => `${plan_id}@${version ?? 0}`),
		).toEqual(["child@1", "child@2", "parent@0"]);
	},
);

test.concurrent("fresh plans must start at version one", () => {
	expect(() =>
		validateCatalogPlanVersionTargets({
			plans: [plan("fresh", 2)],
			products: [],
		}),
	).toThrow("version must be 1, received 2");
});

test.concurrent("renamed plans sequence versions under their target id", () => {
	const plans = [
		plan("legacy", 2, undefined, "current"),
		plan("legacy", 3, undefined, "current"),
	];
	const products = [{ id: "current", version: 1 } as FullProduct];

	expect(() =>
		validateCatalogPlanVersionTargets({ plans, products }),
	).not.toThrow();
});
