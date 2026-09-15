/**
 * Every `licenses[]` entry states versionSlug: a link is pinned to one child
 * version, so a config must name it. A missing slug is `versionSlug is
 * required`, never "follow the child's active version".
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
	"plans.licenses": LINT_REGISTRY["plans.licenses"],
};

const issuesFor = (licenses: Record<string, unknown>[]) =>
	lintDocument({
		document: {
			plans: [
				{ planId: "seat", name: "Seat", versionSlug: "v1", active: true },
				{
					planId: "team",
					name: "Team",
					versionSlug: "v1",
					active: true,
					licenses,
				},
			],
		},
		rules,
		hints: noHints,
	});

test("a license link without versionSlug is refused", () => {
	expect(issuesFor([{ licensePlanId: "seat", included: 5 }])).toEqual([
		{
			path: 'plan "team" › license "seat"',
			message: "versionSlug is required.",
		},
	]);
});

test("a license link naming its child version lints clean", () => {
	expect(
		issuesFor([{ licensePlanId: "seat", versionSlug: "v1", included: 5 }]),
	).toEqual([]);
});
