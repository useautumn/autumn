/**
 * Grader proofs for the existing-catalog and push cases: each golden passes every
 * config verdict, an empty workspace fails them all, and the near-misses the
 * cases exist to catch (v1 repriced in place; the row recreated without its
 * server id) fail exactly the verdict that guards them. Org verdicts need a
 * live org and are not proved here.
 */
import { expect, test } from "bun:test";
import { mintVersion } from "../../cases/misc/existingCatalog/mintVersion.eval.ts";
import {
	proV1Config,
	pullGoldenConfig,
} from "../../cases/misc/existingCatalog/proSetup.ts";
import { pullDashboardEdit } from "../../cases/misc/existingCatalog/pullDashboardEdit.eval.ts";
import { previewApproval } from "../../cases/misc/push/previewApproval.eval.ts";
import { scoreConfigExpectations } from "../utils/scoreConfigExpectations.ts";

const withoutOrgVerdicts = (scores: Record<string, number | null>) =>
	Object.fromEntries(
		Object.entries(scores).filter(([name]) => !name.startsWith("org")),
	);

test("mint-version: golden passes every config verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: mintVersion,
		configFile: mintVersion.goldenConfig,
	});
	expect(withoutOrgVerdicts(scores)).toEqual({
		"config parses and passes validation": 1,
		"modeled exactly 1 plans": 1,
		"has plan: pro active at $25": 1,
		"keeps history version: pro v1 kept at $20": 1,
		"pro has 2 versions in the config": 1,
	});
});

test("mint-version: empty workspace fails every config verdict", async () => {
	const scores = await scoreConfigExpectations({ axCase: mintVersion });
	expect(withoutOrgVerdicts(scores)).toEqual({
		"config parses and passes validation": 0,
		"modeled exactly 1 plans": 0,
		"has plan: pro active at $25": 0,
		"keeps history version: pro v1 kept at $20": 0,
		"pro has 2 versions in the config": 0,
	});
});

test("mint-version: repricing v1 in place fails the history and version-count verdicts", async () => {
	const inPlace = proV1Config.replace(
		'price: { amount: 20, interval: "month" }',
		'price: { amount: 25, interval: "month" }',
	);
	expect(inPlace).toContain("amount: 25");
	const scores = await scoreConfigExpectations({
		axCase: mintVersion,
		configFile: inPlace,
	});
	expect(scores["has plan: pro active at $25"]).toBe(1);
	expect(scores["keeps history version: pro v1 kept at $20"]).toBe(0);
	expect(scores["pro has 2 versions in the config"]).toBe(0);
});

test("pull-dashboard-edit: golden passes every config verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: pullDashboardEdit,
		configFile: pullDashboardEdit.goldenConfig,
	});
	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"modeled exactly 1 plans": 1,
		"has plan: pro with the dashboard's 1000 messages and sso": 1,
		"has feature: sso (boolean)": 1,
		"pro keeps its internalId": 1,
	});
});

test("pull-dashboard-edit: a plan recreated without its server id fails the internalId verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: pullDashboardEdit,
		configFile: pullGoldenConfig({ withInternalId: false }),
	});
	expect(
		scores["has plan: pro with the dashboard's 1000 messages and sso"],
	).toBe(1);
	expect(scores["pro keeps its internalId"]).toBe(0);
});

test("pull-dashboard-edit: the stale config (500 messages, no sso) fails the plan verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: pullDashboardEdit,
		configFile: proV1Config,
	});
	expect(
		scores["has plan: pro with the dashboard's 1000 messages and sso"],
	).toBe(0);
	expect(scores["config parses and passes validation"]).toBe(1);
});

test("push-preview-approval: golden passes every config verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: previewApproval,
		configFile: previewApproval.goldenConfig,
	});
	expect(withoutOrgVerdicts(scores)).toEqual({
		"config parses and passes validation": 1,
		"modeled exactly 1 plans": 1,
		"has plan: pro 500 messages": 1,
		"has feature: ai messages (metered)": 1,
	});
});
