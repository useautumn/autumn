/**
 * TDD contract for org-level transition rules (Settings → Billing → Transition Rules).
 *
 * Contract under test:
 *   New table:
 *     - transition_rules — one row per (org_id, env), carry_over_usages jsonb column
 *   New endpoints:
 *     - GET   /organization/transition_rules -> { carry_over_usages: { enabled, feature_ids? } | null }
 *     - PATCH /organization/transition_rules -> upserts the (org, env) row, returns the same shape
 *   New behaviors:
 *     - GET with no row               -> { carry_over_usages: null }
 *     - PATCH { enabled: true }       -> persisted and returned on subsequent GET
 *     - PATCH with feature_ids        -> feature_ids persisted verbatim
 *     - PATCH { carry_over_usages: null } -> rule cleared, GET back to null
 *
 * Pre-impl red: every request 404s — the route does not exist yet.
 * Post-impl green: all pass once the transition_rules table + org routes ship.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { initScenario } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

type TransitionRulesResponse = {
	carry_over_usages: { enabled: boolean; feature_ids?: string[] } | null;
};

test(`${chalk.yellowBright("transition-rules api: get, upsert, scope by feature_ids, clear")}`, async () => {
	const { ctx } = await initScenario({ setup: [], actions: [] });
	const autumn = new AutumnInt({ secretKey: ctx.orgSecretKey });

	try {
		// ── Contract assertion 1: GET with no row returns null ─────────────
		const initial = (await autumn.get(
			"/organization/transition_rules",
		)) as TransitionRulesResponse;
		expect(initial.carry_over_usages).toBeNull();

		// ── Contract assertion 2: PATCH { enabled: true } persists ─────────
		const enabled = (await autumn.patch("/organization/transition_rules", {
			carry_over_usages: { enabled: true },
		})) as TransitionRulesResponse;
		expect(enabled.carry_over_usages).toEqual({ enabled: true });

		const afterEnable = (await autumn.get(
			"/organization/transition_rules",
		)) as TransitionRulesResponse;
		expect(afterEnable.carry_over_usages).toEqual({ enabled: true });

		// ── Contract assertion 3: feature_ids persisted verbatim ───────────
		const scoped = (await autumn.patch("/organization/transition_rules", {
			carry_over_usages: {
				enabled: true,
				feature_ids: [TestFeature.Messages],
			},
		})) as TransitionRulesResponse;
		expect(scoped.carry_over_usages).toEqual({
			enabled: true,
			feature_ids: [TestFeature.Messages],
		});

		const afterScope = (await autumn.get(
			"/organization/transition_rules",
		)) as TransitionRulesResponse;
		expect(afterScope.carry_over_usages?.feature_ids).toEqual([
			TestFeature.Messages,
		]);

		// ── Contract assertion 4: clearing resets to null ──────────────────
		const cleared = (await autumn.patch("/organization/transition_rules", {
			carry_over_usages: null,
		})) as TransitionRulesResponse;
		expect(cleared.carry_over_usages).toBeNull();

		const afterClear = (await autumn.get(
			"/organization/transition_rules",
		)) as TransitionRulesResponse;
		expect(afterClear.carry_over_usages).toBeNull();
	} finally {
		await autumn
			.patch("/organization/transition_rules", { carry_over_usages: null })
			.catch(() => undefined);
	}
});
