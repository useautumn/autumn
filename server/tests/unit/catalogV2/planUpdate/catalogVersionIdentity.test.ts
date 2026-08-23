import { describe, expect, test } from "bun:test";
import {
	CatalogCorePreviewSchema,
	UpdateCatalogPlanParamsSchema,
} from "@autumn/shared";
import { catalogRowIdentity } from "@/internal/catalogV2/actions/updateCatalog/preview/plans/catalogRowIdentity";

const previewState = { has_customers: false };

describe("UpdateCatalogPlanParams version identity", () => {
	test("omitted identity fields stay undefined", () => {
		const parsed = UpdateCatalogPlanParamsSchema.parse({ plan_id: "pro" });
		expect(parsed.active).toBeUndefined();
		expect(parsed.version_slug).toBeUndefined();
		expect(parsed.new_version_slug).toBeUndefined();
	});

	test("accepts active, version_slug, and new_version_slug", () => {
		const parsed = UpdateCatalogPlanParamsSchema.parse({
			plan_id: "pro",
			active: true,
			version_slug: "abc",
			new_version_slug: "summer",
		});
		expect(parsed.active).toBe(true);
		expect(parsed.version_slug).toBe("abc");
		expect(parsed.new_version_slug).toBe("summer");
	});

	test("rejects a version_slug that fails idRegex", () => {
		const result = UpdateCatalogPlanParamsSchema.safeParse({
			plan_id: "pro",
			version_slug: "bad slug",
		});
		expect(result.success).toBe(false);
	});

	test("rejects a new_version_slug that fails idRegex", () => {
		const result = UpdateCatalogPlanParamsSchema.safeParse({
			plan_id: "pro",
			new_version_slug: "bad slug",
		});
		expect(result.success).toBe(false);
	});

	test("rejects version and version_slug together even when they agree", () => {
		const result = UpdateCatalogPlanParamsSchema.safeParse({
			plan_id: "pro",
			version: 1,
			version_slug: "v1",
		});
		expect(result.success).toBe(false);
	});
});

describe("CatalogCorePreview version identity", () => {
	test("requires version_slug and active", () => {
		const parsed = CatalogCorePreviewSchema.parse({
			plan_id: "pro",
			version: 2,
			version_slug: "v2",
			active: false,
			state: previewState,
		});
		expect(parsed.version_slug).toBe("v2");
		expect(parsed.active).toBe(false);
		expect(parsed.new_plan_id).toBeUndefined();
		expect(parsed.new_version_slug).toBeUndefined();
	});

	test("rejects a kernel missing version_slug", () => {
		const result = CatalogCorePreviewSchema.safeParse({
			plan_id: "pro",
			version: 1,
			active: true,
			state: previewState,
		});
		expect(result.success).toBe(false);
	});

	test("keeps new_plan_id and new_version_slug when present", () => {
		const parsed = CatalogCorePreviewSchema.parse({
			plan_id: "pro",
			new_plan_id: "pro_2",
			version: 2,
			version_slug: "v2",
			new_version_slug: "summer",
			active: true,
			state: previewState,
		});
		expect(parsed.new_plan_id).toBe("pro_2");
		expect(parsed.new_version_slug).toBe("summer");
	});
});

describe("catalogRowIdentity", () => {
	test("mint without slug override: version_slug is v{n}, no new_*", () => {
		expect(
			catalogRowIdentity({
				planId: "pro",
				version: 2,
				current: null,
				next: { id: "pro", version_slug: "v2", active: false },
			}),
		).toEqual({
			plan_id: "pro",
			version: 2,
			version_slug: "v2",
			active: false,
		});
	});

	test("mint with slug override: version_slug is v{n}, new_version_slug is the stamp", () => {
		expect(
			catalogRowIdentity({
				planId: "pro",
				version: 2,
				current: null,
				next: { id: "pro", version_slug: "summer", active: true },
			}),
		).toEqual({
			plan_id: "pro",
			version: 2,
			version_slug: "v2",
			new_version_slug: "summer",
			active: true,
		});
	});

	test("existing rename emits new_version_slug only", () => {
		expect(
			catalogRowIdentity({
				planId: "pro",
				version: 1,
				current: { id: "pro", version_slug: "abc", active: true },
				next: { id: "pro", version_slug: "newSlug", active: true },
			}),
		).toEqual({
			plan_id: "pro",
			version: 1,
			version_slug: "abc",
			new_version_slug: "newSlug",
			active: true,
		});
	});

	test("plan id rename emits new_plan_id only", () => {
		expect(
			catalogRowIdentity({
				planId: "pro",
				version: 1,
				current: { id: "pro", version_slug: "v1", active: true },
				next: { id: "pro_2", version_slug: "v1", active: true },
			}),
		).toEqual({
			plan_id: "pro",
			version: 1,
			version_slug: "v1",
			new_plan_id: "pro_2",
			active: true,
		});
	});
});
