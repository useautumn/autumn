import { describe, expect, test } from "bun:test";
import {
	mintVersionSlugError,
	versionSlugError,
	versionSlugRenamed,
} from "@/views/products/plan/utils/versionSlug";

describe("versionSlugError", () => {
	test("mirrors the server's nonempty + idRegex contract", () => {
		expect(versionSlugError({ slug: "beta_2" })).toBeNull();
		expect(versionSlugError({ slug: "v1" })).toBeNull();
		expect(versionSlugError({ slug: "" })).toBe("Enter a version slug.");
		expect(versionSlugError({ slug: "   " })).toBe("Enter a version slug.");
		expect(versionSlugError({ slug: "beta 2" })).toBe(
			"Use letters, numbers, dashes or underscores only.",
		);
	});
});

describe("mintVersionSlugError", () => {
	test("blank is valid — the server stamps v{n}", () => {
		expect(mintVersionSlugError({ slug: "" })).toBeNull();
		expect(mintVersionSlugError({ slug: "  " })).toBeNull();
	});

	test("a typed slug still has to satisfy idRegex", () => {
		expect(mintVersionSlugError({ slug: "summer_25" })).toBeNull();
		expect(mintVersionSlugError({ slug: "summer 25" })).toBe(
			"Use letters, numbers, dashes or underscores only.",
		);
	});
});

describe("versionSlugRenamed", () => {
	const previous = { version: 3, version_slug: null };

	test("typing over the implicit v{n} label is not a rename", () => {
		expect(
			versionSlugRenamed({
				product: { version: 3, version_slug: "v3" },
				previous,
			}),
		).toBe(false);
	});

	test("a different slug renames the row", () => {
		expect(
			versionSlugRenamed({
				product: { version: 3, version_slug: "beta" },
				previous,
			}),
		).toBe(true);
	});

	test("creating a plan has nothing to rename", () => {
		expect(
			versionSlugRenamed({ product: { version: 1, version_slug: "beta" } }),
		).toBe(false);
	});
});
