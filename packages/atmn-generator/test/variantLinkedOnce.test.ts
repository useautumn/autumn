/**
 * Versioning a base plan without versioning its variant leaves one variant row
 * declared under two versions, and the last write silently wins. The server
 * refuses it; the lint says so first, before any request is built.
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
	planVersions,
}: {
	plans: PlanFixture[];
	planVersions: PlanFixture[];
}): Record<string, unknown> => ({
	plans: [
		...plans.map((row) => ({ ...row, active: true })),
		...planVersions.map((row) => ({ ...row, active: false })),
	],
});

const proVersion = ({
	versionSlug,
	variantVersionSlug,
}: {
	versionSlug: string;
	variantVersionSlug?: string;
}): PlanFixture => ({
	planId: "pro",
	name: "Pro",
	versionSlug,
	variants: [
		{
			variantPlanId: "pro_yearly",
			name: "Pro Yearly",
			...(variantVersionSlug ? { versionSlug: variantVersionSlug } : {}),
		},
	],
});

const issuesFor = (document: Record<string, unknown>) =>
	lintDocument({ document, rules, hints: noHints });

test("a variant declared under two versions of its base is refused", () => {
	expect(
		issuesFor(
			stated({
				plans: [proVersion({ versionSlug: "v2" })],
				planVersions: [proVersion({ versionSlug: "v1" })],
			}),
		),
	).toEqual([
		{
			path: 'plan "pro"',
			message:
				"pro_yearly is linked from pro v2 and pro v1. When versioning a base plan with variants linked, you also need to version the variant, and relink the new version to the new variant version.",
		},
	]);
});

test("the variant named by the version that owns it lints clean", () => {
	expect(
		issuesFor(
			stated({
				plans: [proVersion({ versionSlug: "v2" })],
				planVersions: [{ planId: "pro", name: "Pro", versionSlug: "v1" }],
			}),
		),
	).toEqual([]);
});

test("versioning the variant alongside its base lints clean", () => {
	expect(
		issuesFor(
			stated({
				plans: [proVersion({ versionSlug: "v2", variantVersionSlug: "v2" })],
				planVersions: [
					proVersion({ versionSlug: "v1", variantVersionSlug: "v1" }),
				],
			}),
		),
	).toEqual([]);
});

test("a variant pinned by version number is named by that pin", () => {
	const issues = issuesFor(
		stated({
			plans: [
				{
					planId: "pro",
					versionSlug: "v2",
					variants: [{ variantPlanId: "pro_yearly", version: 1 }],
				},
			],
			planVersions: [
				{
					planId: "pro",
					versionSlug: "v1",
					variants: [{ variantPlanId: "pro_yearly", version: 1 }],
				},
			],
		}),
	);

	expect(issues[0]?.message).toStartWith(
		"pro_yearly v1 is linked from pro v2 and pro v1.",
	);
});

test("a numeric pin and a slug pin are different rows, not one link twice", () => {
	// A variant version with a custom slug makes `version: 1` and
	// `versionSlug: "v1"` name different rows; conflating them invents an error.
	expect(
		issuesFor(
			stated({
				plans: [
					{
						planId: "pro",
						versionSlug: "v2",
						variants: [{ variantPlanId: "pro_yearly", version: 1 }],
					},
				],
				planVersions: [
					{
						planId: "pro",
						versionSlug: "v1",
						variants: [{ variantPlanId: "pro_yearly", versionSlug: "v1" }],
					},
				],
			}),
		),
	).toEqual([]);
});

test("one plan listing the same variant pin twice is refused", () => {
	const issues = issuesFor(
		stated({
			plans: [
				{
					planId: "pro",
					versionSlug: "v2",
					variants: [
						{ variantPlanId: "pro_yearly", versionSlug: "v1" },
						{ variantPlanId: "pro_yearly", versionSlug: "v1" },
					],
				},
			],
			planVersions: [],
		}),
	);

	expect(issues[0]?.message).toStartWith(
		"pro_yearly v1 is linked twice from pro v2.",
	);
});

test("one plan listing the same unpinned variant twice is refused", () => {
	const issues = issuesFor(
		stated({
			plans: [
				{
					planId: "pro",
					variants: [
						{ variantPlanId: "pro_yearly" },
						{ variantPlanId: "pro_yearly" },
					],
				},
			],
			planVersions: [],
		}),
	);

	expect(issues[0]?.message).toStartWith(
		"pro_yearly is linked twice from pro v1.",
	);
});
