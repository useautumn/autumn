import type { Scenario } from "./types/axCase.ts";

/**
 * The standard step-tier world: environment discovery is stated up front and
 * atmn's network verbs are stubbed, so a case spends its turns on the skill
 * behavior under test instead of rediscovering the same setup every run.
 *
 * Deliberately facts-only: the primer never describes the workflow
 * (interview, table, approval, push) — that is what the skill under test
 * teaches, and stating it here would hand the baseline arm the answer and
 * make the with-arm untestable. Setup-flow behavior (login, pull, real push)
 * gets its own dedicated cases without this scenario.
 */
export const stepScenario = (): Scenario => ({
	primer: [
		"Project state (already verified, do not re-check): atmn is installed in",
		"node_modules, a valid AUTUMN_SECRET_KEY is in .env, and the Autumn org",
		"is empty — there is nothing to pull and no dashboard work needed.",
	].join(" "),
});
