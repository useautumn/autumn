/**
 * Every version of a plan sits in one `plans` array and says whether it is
 * the live one. Exactly one row per planId carries `active: true`: none means
 * nobody can buy the plan, two means the server cannot tell which to sell.
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

const issuesFor = (plans: Record<string, unknown>[]) =>
	lintDocument({ document: { plans }, rules, hints: noHints });

const ACTIVE_HINT =
	"Every version of a plan lives in plans; mark the one customers can buy active: true and the rest active: false.";

test("one active version per plan is the happy path", () => {
	expect(
		issuesFor([
			{ planId: "pro", versionSlug: "v2", name: "Pro", active: true },
			{ planId: "pro", versionSlug: "v1", name: "Pro", active: false },
			{ planId: "free", versionSlug: "v1", name: "Free", active: true },
		]),
	).toEqual([]);
});

test("a plan with no active version is refused on its first row", () => {
	expect(
		issuesFor([
			{ planId: "pro", versionSlug: "v2", name: "Pro", active: false },
			{ planId: "pro", versionSlug: "v1", name: "Pro", active: false },
		]),
	).toEqual([
		{
			path: 'plan "pro"',
			message: `Plan "pro" has 2 versions and none is active. ${ACTIVE_HINT}`,
		},
	]);
});

test("a plan with two active versions is refused on the second", () => {
	expect(
		issuesFor([
			{ planId: "pro", versionSlug: "v2", name: "Pro", active: true },
			{ planId: "pro", versionSlug: "v1", name: "Pro", active: true },
		]),
	).toEqual([
		{
			path: 'plan "pro"',
			message: `Plan "pro" has 2 versions and 2 are active. ${ACTIVE_HINT}`,
		},
	]);
});

test("a single-version plan still has to say active: true", () => {
	expect(
		issuesFor([{ planId: "pro", versionSlug: "v1", name: "Pro" }]),
	).toEqual([
		{
			path: 'plan "pro"',
			message: `Plan "pro" has 1 version and none is active. ${ACTIVE_HINT}`,
		},
	]);
});

test("known rows with no active version read as a half-done rename", () => {
	// Every row of "pro_new" came from the server, and none is live: the live
	// one is still under the old id. The lint says so rather than "add one".
	expect(
		issuesFor([
			{
				planId: "pro",
				internalId: "prod_v2",
				versionSlug: "v2",
				name: "Pro",
				active: true,
			},
			{
				planId: "pro_new",
				internalId: "prod_v1",
				versionSlug: "v1",
				name: "Pro",
				active: false,
			},
		]),
	).toEqual([
		{
			path: 'plan "pro_new"',
			message: `Plan "pro_new" has 1 version and none is active. ${ACTIVE_HINT} If you are renaming a plan, change the planId on every one of its versions, not just some.`,
		},
	]);
});
