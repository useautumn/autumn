import { describe, expect, test } from "bun:test";
import { buildPromoteCatalogPlanParams } from "@/views/products/plan/hooks/usePromotePlanVersion";

describe("buildPromoteCatalogPlanParams", () => {
	test("targets the row by version_slug when present", () => {
		expect(
			buildPromoteCatalogPlanParams({
				product: { id: "pro", version: 2, version_slug: "v2" },
			}),
		).toEqual({
			plan_id: "pro",
			version_slug: "v2",
			active: true,
		});
	});

	test("falls back to version when the slug is missing", () => {
		expect(
			buildPromoteCatalogPlanParams({
				product: { id: "pro", version: 2, version_slug: null },
			}),
		).toEqual({
			plan_id: "pro",
			version: 2,
			active: true,
		});
	});
});
