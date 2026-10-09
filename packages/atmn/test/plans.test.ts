/**
 * Plans ride the same `atmn()` as features. What is new: every version is a
 * row in `plans` and says whether it is live, an omitted key stays omitted,
 * and a plan item must name a declared feature.
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

const ACTIVE_HINT =
	"Every version of a plan lives in plans; mark the one customers can buy active: true and the rest active: false.";

test("every version is one wire row, active as the config states it", () => {
	const wire = atmn({
		features: [],
		plans: [
			plan({ planId: "pro", name: "Pro", versionSlug: "v2", active: true }),
			plan({ planId: "pro", name: "Pro", versionSlug: "v1", active: false }),
		],
		// biome-ignore lint/suspicious/noExplicitAny: asserting on wire shape
	}) as any;

	expect(wire.plans).toEqual([
		{ plan_id: "pro", name: "Pro", version_slug: "v2", active: true },
		{ plan_id: "pro", name: "Pro", version_slug: "v1", active: false },
	]);
	// Stated plans are every version: the ones omitted are removed.
	expect(wire.skip_version_deletions).toBe(false);
});

test("a plan with no active version is refused, naming the plan", () => {
	const issues = issuesOf(() =>
		atmn({
			plans: [
				plan({ planId: "free", name: "Free", versionSlug: "v1", active: true }),
				plan({ planId: "pro", name: "Pro", versionSlug: "v1", active: false }),
				plan({
					planId: "legacy",
					name: "Legacy",
					versionSlug: "v1",
					active: false,
				}),
			],
		}),
	);
	expect(issues).toEqual([
		{
			path: 'plan "pro"',
			message: `Plan "pro" has 1 version and none is active. ${ACTIVE_HINT}`,
		},
		{
			path: 'plan "legacy"',
			message: `Plan "legacy" has 1 version and none is active. ${ACTIVE_HINT}`,
		},
	]);
});

test("a plan with two active versions is refused on the second", () => {
	const issues = issuesOf(() =>
		atmn({
			plans: [
				plan({ planId: "pro", name: "Pro", versionSlug: "v1", active: true }),
				plan({ planId: "pro", name: "Pro", versionSlug: "v2", active: true }),
			],
		}),
	);
	expect(issues).toEqual([
		{
			path: 'plan "pro"',
			message: `Plan "pro" has 2 versions and 2 are active. ${ACTIVE_HINT}`,
		},
	]);
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

test("a plan item must meter a declared feature, named by breadcrumb", () => {
	const issues = issuesOf(() =>
		atmn({
			features: [
				feature({ featureId: "seats", name: "Seats", type: "boolean" }),
			],
			plans: [
				plan({
					active: true,
					planId: "pro",
					name: "Pro",
					versionSlug: "v1",
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
		atmn({
			plans: [
				plan({
					active: true,
					planId: "pro",
					name: "Pro",
					versionSlug: "v1",
					items: [{ featureId: "ghost" }],
				}),
			],
		}),
	).not.toThrow();
});

const usageBasedVolumeConfig = ({
	tiers,
}: {
	tiers: { to: number | "inf"; amount: number }[];
}) =>
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
				active: true,
				planId: "pro",
				name: "Pro",
				versionSlug: "v1",
				items: [
					{
						featureId: "api",
						price: {
							billingMethod: "usage_based",
							tierBehavior: "volume",
							tiers,
							interval: "month",
						},
					},
				],
			}),
		],
	});

test("a volume-tiered item price can be usage-based", () => {
	const issues = issuesOf(() =>
		usageBasedVolumeConfig({
			tiers: [
				{ to: 100, amount: 1 },
				{ to: "inf", amount: 0.5 },
			],
		}),
	);
	expect(issues).toEqual([]);
});

test("a usage-based volume price needs at least two tiers", () => {
	const issues = issuesOf(() =>
		usageBasedVolumeConfig({ tiers: [{ to: "inf", amount: 1 }] }),
	);
	expect(issues).toEqual([
		{
			path: 'plan "pro" › item "api" › price',
			message:
				"Volume-based pricing on a usage-based item needs at least two tiers. Add a tier, or use graduated pricing for a single rate.",
		},
	]);
});

const allocatedVolumeConfig = ({ included }: { included?: number }) =>
	atmn({
		features: [
			feature({
				featureId: "seats",
				name: "Seats",
				type: "metered",
				consumable: false,
			}),
		],
		plans: [
			plan({
				active: true,
				planId: "pro",
				name: "Pro",
				versionSlug: "v1",
				items: [
					{
						featureId: "seats",
						...(included === undefined ? {} : { included }),
						price: {
							billingMethod: "usage_based",
							tierBehavior: "volume",
							tiers: [
								{ to: 10, amount: 10, flatAmount: 5 },
								{ to: "inf", amount: 8 },
							],
							interval: "month",
						},
					},
				],
			}),
		],
	});

test("an allocated volume item can't have a first-tier flatAmount without included usage", () => {
	expect(issuesOf(() => allocatedVolumeConfig({}))).toEqual([
		{
			path: 'plan "pro" › item "seats"',
			message:
				'features "seats" has consumable false, so this is refused. A volume-tiered allocated item needs included usage before a first-tier flatAmount: Stripe would charge that fee at 0 seats. Add included usage or move the fee to a later tier.',
		},
	]);
});

test("an allocated volume item with included usage can have a first-tier flatAmount", () => {
	expect(issuesOf(() => allocatedVolumeConfig({ included: 3 }))).toEqual([]);
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
			plans: [
				plan({
					active: true,
					planId: "pro",
					name: "Pro",
					versionSlug: "v1",
					items,
				}),
			],
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
			plans: [
				plan({
					active: true,
					planId: "pro",
					name: "Pro",
					versionSlug: "v1",
					items,
				}),
			],
		}),
	).not.toThrow();
});

test("a variant linked from two versions of its base is refused", () => {
	const proYearly = { variantPlanId: "pro_yearly", name: "Pro Yearly" };
	const issues = issuesOf(() =>
		atmn({
			plans: [
				plan({
					active: true,
					planId: "pro",
					name: "Pro",
					versionSlug: "v2",
					variants: [proYearly],
				}),
				plan({
					active: false,
					planId: "pro",
					name: "Pro",
					versionSlug: "v1",
					variants: [proYearly],
				}),
			],
		}),
	);

	expect(issues).toEqual([
		{
			path: 'plan "pro"',
			message:
				"pro_yearly is linked from pro v2 and pro v1. When versioning a base plan with variants linked, you also need to version the variant, and relink the new version to the new variant version.",
		},
		{
			path: 'plan "pro" › variant "pro_yearly"',
			message: "versionSlug is required.",
		},
		{
			path: 'plan "pro" › variant "pro_yearly"',
			message: "versionSlug is required.",
		},
	]);
});

test("versioning the variant alongside its base lints clean", () => {
	const proYearly = (versionSlug: string) => ({
		variantPlanId: "pro_yearly",
		name: "Pro Yearly",
		versionSlug,
	});

	expect(() =>
		atmn({
			plans: [
				plan({
					active: true,
					planId: "pro",
					name: "Pro",
					versionSlug: "v2",
					variants: [proYearly("v2")],
				}),
				plan({
					active: false,
					planId: "pro",
					name: "Pro",
					versionSlug: "v1",
					variants: [proYearly("v1")],
				}),
			],
		}),
	).not.toThrow();
});

test("a field the CLI hides is refused when a config still states it", () => {
	// A config pulled by an older release can carry baseVariantId; the server
	// would read it as a variant link, so lint refuses it before anything is sent.
	const issues = issuesOf(() =>
		atmn({
			features: [],
			plans: [
				plan({
					planId: "max_annual",
					name: "Max (annual)",
					versionSlug: "v1",
					active: true,
					baseVariantId: "max_monthly",
					variants: [
						{
							variantPlanId: "max_annual_eu",
							name: "Max (annual, EU)",
							versionSlug: "v1",
							baseVariantId: null,
						},
					],
					// biome-ignore lint/suspicious/noExplicitAny: a stale config states fields the type no longer has
				} as any),
			],
		}),
	);
	expect(issues).toEqual([
		{
			path: 'plan "max_annual"',
			message: "baseVariantId is not a config field. Remove it.",
		},
		{
			path: 'plan "max_annual" › variant "max_annual_eu"',
			message: "baseVariantId is not a config field. Remove it.",
		},
	]);
});
