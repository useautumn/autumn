/**
 * Every plan row and every `variants[]` entry states versionSlug. A missing
 * slug is `versionSlug is required`, not an implicit v1.
 */

import { expect, test } from "bun:test";
import { LINT_REGISTRY } from "../src/lint/rules/registry";
import {
	type LintHints,
	type LintRules,
	lintDocument,
} from "../src/lint/runtime/lintDocument";

const noHints: LintHints = { recordPaths: new Set(), frozenPaths: new Set() };

const rules: LintRules = {
	plans: LINT_REGISTRY.plans,
	"plans.variants": LINT_REGISTRY["plans.variants"],
};

type PlanFixture = Record<string, unknown>;

/** One `plans` array: the live rows carry `active: true`, the rest `active: false`. */
const stated = ({
	live,
	history = [],
}: {
	live: PlanFixture[];
	history?: PlanFixture[];
}): Record<string, unknown> => ({
	plans: [
		...live.map((row) => ({ ...row, active: true })),
		...history.map((row) => ({ ...row, active: false })),
	],
});

const issuesFor = (document: Record<string, unknown>) =>
	lintDocument({ document, rules, hints: noHints });

test("a single slug-less plan row is refused", () => {
	expect(issuesFor(stated({ live: [{ planId: "pro", name: "Pro" }] }))).toEqual([
		{ path: 'plan "pro"', message: "versionSlug is required." },
	]);
});

test("a slug-less row next to an explicit v1 asks for versionSlug, not a v1 clash", () => {
	expect(
		issuesFor(
			stated({
				live: [{ planId: "pro", name: "Pro", versionSlug: "v2" }],
				history: [
					{ planId: "pro", name: "Pro", versionSlug: "v1" },
					{ planId: "pro", name: "Pro" },
				],
			}),
		),
	).toEqual([{ path: 'plan "pro"', message: "versionSlug is required." }]);
});

test("every version stating its slug lints clean", () => {
	expect(
		issuesFor(
			stated({
				live: [{ planId: "pro", name: "Pro", versionSlug: "v2" }],
				history: [{ planId: "pro", name: "Pro", versionSlug: "v1" }],
			}),
		),
	).toEqual([]);
});

test("a variant entry without versionSlug is refused", () => {
	expect(
		issuesFor(
			stated({
				live: [
					{
						planId: "pro",
						name: "Pro",
						versionSlug: "v1",
						variants: [{ variantPlanId: "proYearly" }],
					},
				],
			}),
		),
	).toEqual([
		{
			path: 'plan "pro" › variant "proYearly"',
			message: "versionSlug is required.",
		},
	]);
});

test("a variant entry that states versionSlug lints clean", () => {
	expect(
		issuesFor(
			stated({
				live: [
					{
						planId: "pro",
						name: "Pro",
						versionSlug: "v1",
						variants: [{ variantPlanId: "proYearly", versionSlug: "v1" }],
					},
				],
			}),
		),
	).toEqual([]);
});
