import { expect, test } from "bun:test";
import type { CatalogPlanParams } from "@autumn/shared";
import {
	sortCatalogPlansByDependencies,
	validateCatalogPlanVersionTargets,
} from "@/internal/catalog/actions/catalogPlanDependencies.js";

const plan = (
	plan_id: string,
	version?: number,
	licenses?: CatalogPlanParams["licenses"],
): CatalogPlanParams => ({ plan_id, version, licenses });

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
