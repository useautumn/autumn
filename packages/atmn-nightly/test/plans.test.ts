/**
 * Plans ride the same `atmn()` as features. What is new: history rows fold
 * into `plans` with `active` stamped by array membership, an omitted key stays
 * omitted, and a plan item must name a declared feature.
 */

import { expect, test } from "bun:test";
import { feature } from "../src/generated/features";
import { ConfigError } from "../src/generated/lintRuntime";
import { plan } from "../src/generated/plans";
import { atmn } from "../src/generated/wire";

const issuesOf = (run: () => unknown) => {
	try {
		run();
	} catch (error) {
		if (error instanceof ConfigError) return error.issues;
		throw error;
	}
	return [];
};

test("active rows and history rows become one wire collection with active stamped", () => {
	const wire = atmn({
		features: [],
		plans: [plan({ planId: "pro", name: "Pro", versionSlug: "v2" })],
		planVersions: [plan({ planId: "pro", name: "Pro", versionSlug: "v1" })],
		// biome-ignore lint/suspicious/noExplicitAny: asserting on wire shape
	}) as any;

	expect(wire.plans).toEqual([
		{ plan_id: "pro", name: "Pro", version_slug: "v2", active: true },
		{ plan_id: "pro", name: "Pro", version_slug: "v1", active: false },
	]);
	expect(Object.hasOwn(wire, "plan_versions")).toBe(false);
});

test("a draft is a row in plans with explicit active: false", () => {
	const wire = atmn({
		plans: [plan({ planId: "pro", versionSlug: "v3", active: false })],
		// biome-ignore lint/suspicious/noExplicitAny: asserting on wire shape
	}) as any;
	expect(wire.plans[0].active).toBe(false);
});

test("an omitted collection stays omitted", () => {
	// biome-ignore lint/suspicious/noExplicitAny: asserting on wire shape
	const wire = atmn({ features: [] }) as any;
	expect(Object.hasOwn(wire, "plans")).toBe(false);
	// biome-ignore lint/suspicious/noExplicitAny: asserting on wire shape
	const onlyPlans = atmn({ plans: [] }) as any;
	expect(Object.hasOwn(onlyPlans, "features")).toBe(false);
	expect(onlyPlans.plans).toEqual([]);
});

test("history without plans is refused: it would remove every active version", () => {
	const issues = issuesOf(() =>
		atmn({ planVersions: [plan({ planId: "pro", versionSlug: "v1" })] }),
	);
	expect(issues).toHaveLength(1);
	expect(issues[0]?.message).toContain("planVersions needs plans");
});

test("a plan item must meter a declared feature, named by breadcrumb", () => {
	const issues = issuesOf(() =>
		atmn({
			features: [
				feature({ featureId: "seats", name: "Seats", type: "boolean" }),
			],
			plans: [
				plan({
					planId: "pro",
					items: [{ featureId: "seats" }, { featureId: "ghost", included: 5 }],
				}),
			],
		}),
	);
	expect(issues).toEqual([
		{
			path: 'plan "pro" › item "ghost"',
			message:
				'featureId "ghost" is not in features. A plan item meters a feature this config does not declare.',
		},
	]);
});

test("with features omitted, item references are not checked: absent means not mine", () => {
	expect(() =>
		atmn({ plans: [plan({ planId: "pro", items: [{ featureId: "ghost" }] })] }),
	).not.toThrow();
});

test("a volume-tiered item price must be prepaid", () => {
	const issues = issuesOf(() =>
		atmn({
			features: [
				feature({
					featureId: "api",
					name: "API calls",
					type: "metered",
					consumable: true,
				}),
			],
			plans: [
				plan({
					planId: "pro",
					items: [
						{
							featureId: "api",
							price: {
								billingMethod: "usage_based",
								tierBehavior: "volume",
								tiers: [{ to: "inf", amount: 1 }],
								interval: "month",
							},
						},
					],
				}),
			],
		}),
	);
	expect(issues).toEqual([
		{
			path: 'plan "pro" › item "api" › price',
			message:
				'billingMethod must be "prepaid" when tierBehavior is "volume". Volume tiers are prepaid-only.',
		},
	]);
});

test("featureOverride is only honoured on classic credit-system features", () => {
	const items = [
		{ featureId: "credits", featureOverride: { creditSchema: [] } },
	];

	const withMetered = issuesOf(() =>
		atmn({
			features: [
				feature({
					featureId: "credits",
					name: "Credits",
					type: "metered",
					consumable: true,
				}),
			],
			plans: [plan({ planId: "pro", items })],
		}),
	);
	expect(withMetered).toEqual([
		{
			path: 'plan "pro" › item "credits"',
			message:
				'featureOverride needs features "credits" to have type "credit_system" — got "metered". featureOverride is only honoured on classic credit-system features.',
		},
	]);

	expect(() =>
		atmn({
			features: [
				feature({
					featureId: "credits",
					name: "Credits",
					type: "credit_system",
				}),
			],
			plans: [plan({ planId: "pro", items })],
		}),
	).not.toThrow();
});
