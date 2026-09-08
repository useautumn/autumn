/**
 * Once a plan has more than one version, a slug-less row stops meaning "the
 * v1" and starts meaning "whichever"; every version has to say which it is.
 */

import { expect, test } from "bun:test";
import { LINT_REGISTRY } from "../src/lint/rules/registry";
import {
	type LintHints,
	type LintRules,
	lintDocument,
} from "../src/lint/runtime/lintDocument";

const noHints: LintHints = { recordPaths: new Set(), frozenPaths: new Set() };

const rules: LintRules = { plans: LINT_REGISTRY.plans };

type PlanFixture = Record<string, unknown>;

/** `atmn()` folds planVersions into plans before linting, stamping `active`. */
const stated = ({
	plans,
	planVersions = [],
}: {
	plans: PlanFixture[];
	planVersions?: PlanFixture[];
}): Record<string, unknown> => ({
	plans: [
		...plans.map((row) => ({ ...row, active: true })),
		...planVersions.map((row) => ({ ...row, active: false })),
	],
});

const issuesFor = (document: Record<string, unknown>) =>
	lintDocument({ document, rules, hints: noHints });

const SLUG_HINT = "Add versionSlug to every version so they can be told apart.";

test("two rows of one plan where one lacks versionSlug are refused, once", () => {
	expect(
		issuesFor(
			stated({
				plans: [{ planId: "pro", name: "Pro", versionSlug: "v2" }],
				planVersions: [{ planId: "pro", name: "Pro" }],
			}),
		),
	).toEqual([
		{
			path: 'plan "pro"',
			message: `Plan "pro" has 2 versions but only 1 states versionSlug. ${SLUG_HINT}`,
		},
	]);
});

test("a single slug-less row is the implicit v1 and lints clean", () => {
	expect(
		issuesFor(stated({ plans: [{ planId: "pro", name: "Pro" }] })),
	).toEqual([]);
});

test("every version stating its slug lints clean", () => {
	expect(
		issuesFor(
			stated({
				plans: [{ planId: "pro", name: "Pro", versionSlug: "v2" }],
				planVersions: [{ planId: "pro", name: "Pro", versionSlug: "v1" }],
			}),
		),
	).toEqual([]);
});

test("a variant declared under two versions where one entry lacks its slug is refused", () => {
	const issues = issuesFor(
		stated({
			plans: [
				{
					planId: "pro",
					name: "Pro",
					versionSlug: "v2",
					variants: [{ variantPlanId: "proYearly", versionSlug: "v2" }],
				},
			],
			planVersions: [
				{
					planId: "pro",
					name: "Pro",
					versionSlug: "v1",
					variants: [{ variantPlanId: "proYearly" }],
				},
			],
		}),
	);
	expect(issues).toEqual([
		{
			path: 'plan "pro"',
			message: `Variant "proYearly" is declared under 2 versions of "pro" but only 1 states versionSlug. ${SLUG_HINT}`,
		},
	]);
});

test("a variant declared once without a slug lints clean", () => {
	expect(
		issuesFor(
			stated({
				plans: [
					{
						planId: "pro",
						name: "Pro",
						variants: [{ variantPlanId: "proYearly" }],
					},
				],
			}),
		),
	).toEqual([]);
});

test("a plan with an active row beside its history lints clean", () => {
	expect(
		issuesFor(
			stated({
				plans: [{ planId: "pro", name: "Pro", versionSlug: "v2" }],
				planVersions: [{ planId: "pro", name: "Pro", versionSlug: "v1" }],
			}),
		),
	).toEqual([]);
});
