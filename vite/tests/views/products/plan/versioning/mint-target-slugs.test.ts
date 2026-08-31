import { describe, expect, test } from "bun:test";
import type { VariantTarget } from "@/views/products/plan/catalog/catalogPlanPreview";
import { emptyCatalogPlanChangeDiff } from "@/views/products/plan/catalog/catalogPlanPreview";
import {
	effectiveMintSlug,
	mintTargetSlugConflicts,
	mintTargetSlugError,
	propagateWithMintSlugs,
	withMintSlugOverride,
} from "@/views/products/plan/versioning/mintTargetSlugs";

const target = (
	overrides: Partial<VariantTarget> & { planId: string },
): VariantTarget => ({
	name: overrides.planId,
	versions: [
		{
			version: 2,
			key: `${overrides.planId}:2`,
			conflicts: [],
			...emptyCatalogPlanChangeDiff(),
		},
	],
	mintsNewVersion: true,
	mintVersion: 3,
	takenSlugs: [],
	...overrides,
});

describe("mint target slugs", () => {
	test("targets reuse the base slug until overridden", () => {
		const selection = { base: "add-dashboard", overrides: {} };
		expect(effectiveMintSlug({ selection, planId: "pro_eu" })).toBe(
			"add-dashboard",
		);

		const overridden = withMintSlugOverride({
			selection,
			planId: "pro_eu",
			slug: "add-dashboard-eu",
		});
		expect(effectiveMintSlug({ selection: overridden, planId: "pro_eu" })).toBe(
			"add-dashboard-eu",
		);
		expect(effectiveMintSlug({ selection: overridden, planId: "pro_uk" })).toBe(
			"add-dashboard",
		);
	});

	test("an override to blank falls back to the server default, not the base", () => {
		const selection = withMintSlugOverride({
			selection: { base: "add-dashboard", overrides: {} },
			planId: "pro_eu",
			slug: "",
		});
		expect(effectiveMintSlug({ selection, planId: "pro_eu" })).toBe("");
	});

	test("flags a slug another version of that plan already holds", () => {
		expect(
			mintTargetSlugError({ slug: "add-dashboard", takenSlugs: ["v1", "v2"] }),
		).toBeNull();
		expect(
			mintTargetSlugError({
				slug: "add-dashboard",
				takenSlugs: ["v1", "add-dashboard"],
			}),
		).toBe("Another version of this plan already uses add-dashboard.");
		expect(mintTargetSlugError({ slug: "", takenSlugs: ["v1"] })).toBeNull();
		expect(
			mintTargetSlugError({ slug: "not a slug", takenSlugs: [] }),
		).not.toBeNull();
	});

	test("only selected minting targets can conflict", () => {
		const targets = [
			target({ planId: "pro_eu", takenSlugs: ["v1", "add-dashboard"] }),
			target({ planId: "pro_uk", takenSlugs: ["v1"] }),
			target({
				planId: "legacy",
				mintsNewVersion: false,
				takenSlugs: ["add-dashboard"],
			}),
		];
		const selectedKeys = ["pro_eu", "pro_uk", "legacy"];
		const selection = { base: "add-dashboard", overrides: {} };

		expect(
			mintTargetSlugConflicts({ targets, selectedKeys, selection }).map(
				(entry) => entry.planId,
			),
		).toEqual(["pro_eu"]);

		expect(
			mintTargetSlugConflicts({
				targets,
				selectedKeys: ["pro_uk"],
				selection,
			}),
		).toEqual([]);

		expect(
			mintTargetSlugConflicts({
				targets,
				selectedKeys,
				selection: {
					base: "add-dashboard",
					overrides: { pro_eu: "add-dashboard-eu" },
				},
			}),
		).toEqual([]);
	});

	test("stamps the effective slug onto every variant target, trimmed", () => {
		expect(
			propagateWithMintSlugs({
				propagate: {
					variants: [{ plan_id: "pro_eu" }, { plan_id: "pro_uk" }],
					license_parents: [{ plan_id: "team", version: 2 }],
				},
				selection: {
					base: " add-dashboard ",
					overrides: { pro_uk: "add-dashboard-uk" },
				},
			}),
		).toEqual({
			variants: [
				{ plan_id: "pro_eu", new_version_slug: "add-dashboard" },
				{ plan_id: "pro_uk", new_version_slug: "add-dashboard-uk" },
			],
			license_parents: [{ plan_id: "team", version: 2 }],
		});
	});

	test("a blank selection leaves targets unnamed so the server stamps v{n}", () => {
		expect(
			propagateWithMintSlugs({
				propagate: { variants: [{ plan_id: "pro_eu" }] },
				selection: { base: "", overrides: {} },
			}),
		).toEqual({ variants: [{ plan_id: "pro_eu" }] });
		expect(
			propagateWithMintSlugs({
				propagate: undefined,
				selection: { base: "add-dashboard", overrides: {} },
			}),
		).toBeUndefined();
	});
});
