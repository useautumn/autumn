/**
 * `atmn()` is the entire client-side computation, so this is the test that says
 * what the CLI is allowed to decide: recase the keys, state the two constants,
 * and nothing else. No versioning, no propagation, no working out which plans
 * need a migration.
 *
 * It runs the GENERATED module, not a copy of its logic — a test that reasoned
 * about the emitter would pass while the emitted code was wrong.
 */

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import yaml from "yaml";
import { feature } from "../src/generated/features";
import { license } from "../src/generated/licenses";
import { plan } from "../src/generated/plans";
import { ConfigError } from "../src/generated/lintRuntime";
import { type AtmnConfig, atmn } from "../src/generated/wire";

// biome-ignore lint/suspicious/noExplicitAny: the raw OpenAPI document
const specDocument = (): any =>
	yaml.parse(
		readFileSync(
			`${import.meta.dir}/../../openapi/openapi-internal.yml`,
			"utf8",
		),
	);

test("fixtures become a wire document with snake_case keys", () => {
	const wire = atmn({
		features: [
			feature({
				featureId: "messages",
				name: "Messages",
				type: "metered",
				consumable: true,
			}),
		],
		// biome-ignore lint/suspicious/noExplicitAny: asserting on wire shape
	}) as any;

	expect(wire.features[0]).toEqual({
		feature_id: "messages",
		name: "Messages",
		type: "metered",
		consumable: true,
	});
});

test("record keys survive while their values are recased", () => {
	const wire = atmn({
		features: [
			feature({
				featureId: "credits",
				name: "Credits",
				type: "ai_credit_system",
				// A key with a capital ON PURPOSE: "gpt-4" would survive snake-casing
				// by accident and the test would pass with record handling removed.
				modelMarkups: { "openai/gptFourTurbo": { markup: 1.2, inputCost: 3 } },
			}),
		],
		// biome-ignore lint/suspicious/noExplicitAny: asserting on wire shape
	}) as any;

	// The slug is the user's; the fields inside are ours.
	expect(wire.features[0].model_markups).toEqual({
		"openai/gptFourTurbo": { markup: 1.2, input_cost: 3 },
	});
});

test("the two constants are stated, and nothing else is decided", () => {
	// biome-ignore lint/suspicious/noExplicitAny: asserting on wire shape
	const wire = atmn({ features: [] }) as any;

	expect(wire.skip_deletions).toBe(false);
	expect(wire.migration).toEqual({ draft: true });

	// Fields the CLI must never send: these are the server's decisions.
	for (const forbidden of ["versioning", "propagate", "new_plan_id"]) {
		expect(wire[forbidden]).toBeUndefined();
	}
});

test("an empty collection is stated, not omitted", () => {
	// Omitted would mean "I do not manage features"; `[]` means "I manage them
	// and there are none", which is what makes deleting the last one work.
	// biome-ignore lint/suspicious/noExplicitAny: asserting on wire shape
	const wire = atmn({ features: [] }) as any;
	expect(Object.hasOwn(wire, "features")).toBe(true);
	expect(wire.features).toEqual([]);
});

test("collections the CLI cannot express yet stay absent", () => {
	// `plans` has no default in the schema, so absent means unmanaged. That is
	// what lets the CLI ship features before it understands plans without
	// sweeping every plan in the org.
	// biome-ignore lint/suspicious/noExplicitAny: asserting on wire shape
	const wire = atmn({ features: [] }) as any;
	expect(Object.hasOwn(wire, "plans")).toBe(false);

	const envelope =
		specDocument().paths["/v1/catalogV2.update"].post.requestBody.content[
			"application/json"
		].schema;
	expect(envelope.properties.plans.default).toBeUndefined();
}, 30_000);

test("stated plans are every version: the ones omitted are removed", () => {
	// biome-ignore lint/suspicious/noExplicitAny: asserting on wire shape
	const stated = atmn({ plans: [] }) as any;
	expect(stated.skip_version_deletions).toBe(false);
	// biome-ignore lint/suspicious/noExplicitAny: asserting on wire shape
	const absent = atmn({ features: [] }) as any;
	expect(Object.hasOwn(absent, "skip_version_deletions")).toBe(false);
});

test("declared variants remain PUT state and never generate propagation", () => {
	const wire = atmn({
		plans: [
			plan({
				active: true,
				planId: "pro",
				name: "Pro",
				versionSlug: "v1",
				variants: [
					{
						variantPlanId: "pro_annual",
						name: "Pro (annual)",
						versionSlug: "v2",
					},
				],
			}),
		],
		// biome-ignore lint/suspicious/noExplicitAny: asserting on wire shape
	}) as any;
	expect(wire.plans[0].variants).toEqual([
		{
			variant_plan_id: "pro_annual",
			name: "Pro (annual)",
			version_slug: "v2",
			customize: null,
		},
	]);
	expect(wire.plans[0].archived).toBeUndefined();
	expect(wire.plans[0].propagate).toBeUndefined();
});

test("declared licenses pin the exact child version row", () => {
	const wire = atmn({
		plans: [
			plan({
				active: true,
				planId: "team",
				name: "Team",
				versionSlug: "v1",
				licenses: [
					license({
						licensePlanId: "seat",
						versionSlug: "v2",
						included: 2,
					}),
				],
			}),
		],
		// biome-ignore lint/suspicious/noExplicitAny: asserting on wire shape
	}) as any;

	expect(wire.plans[0].licenses).toEqual([
		{
			license_plan_id: "seat",
			version_slug: "v2",
			included: 2,
			customize: null,
		},
	]);
});

test("declared relationship customizations remain explicit", () => {
	const wire = atmn({
		plans: [
			plan({
				active: true,
				planId: "team",
				name: "Team",
				versionSlug: "v1",
				licenses: [
					license({
						licensePlanId: "seat",
						versionSlug: "v1",
						customize: {
							addItems: [{ featureId: "messages", included: 200 }],
						},
					}),
				],
				variants: [
					{
						variantPlanId: "team_eu",
						name: "Team EU",
						versionSlug: "v1",
						customize: { items: [] },
					},
				],
			}),
		],
		// biome-ignore lint/suspicious/noExplicitAny: asserting on wire shape
	}) as any;

	expect(wire.plans[0].licenses[0].customize).toEqual({
		add_items: [{ feature_id: "messages", included: 200 }],
	});
	expect(wire.plans[0].variants[0].customize).toEqual({ items: [] });
});

test("explicit archived state overrides the live membership default", () => {
	const wire = atmn({
		plans: [
			plan({
				active: true,
				planId: "retired",
				name: "Retired",
				versionSlug: "v1",
				archived: true,
				variants: [
					{
						variantPlanId: "retired_eu",
						name: "Retired EU",
						versionSlug: "v1",
						archived: true,
					},
				],
			}),
		],
		// biome-ignore lint/suspicious/noExplicitAny: asserting on wire shape
	}) as any;

	expect(wire.plans[0].archived).toBe(true);
	expect(wire.plans[0].variants[0].archived).toBe(true);
});

test("a config from another version of the CLI is refused, not silently trimmed", () => {
	const issuesOf = (run: () => unknown) => {
		try {
			run();
		} catch (error) {
			if (error instanceof ConfigError) return error.issues;
			throw error;
		}
		return [];
	};

	// The previous nightly kept history in `planVersions`; dropping it would
	// delete those versions on the next push.
	const stale = issuesOf(() =>
		atmn({ plans: [], planVersions: [] } as unknown as AtmnConfig),
	);
	expect(stale).toHaveLength(1);
	expect(stale[0]?.path).toBe("planVersions");
	expect(stale[0]?.message).toContain("every version is now a row in plans");
	expect(stale[0]?.message).toContain("atmn pull --overwrite --yes");

	const typo = issuesOf(() => atmn({ products: [] } as unknown as AtmnConfig));
	expect(typo[0]?.message).toBe(
		"products is not a config field. The fields are features, plans, rewards, referralPrograms, settings.",
	);
});
