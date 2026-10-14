import type { Scenario } from "./types/axCase.ts";

export const stepScenario = (): Scenario => ({
	primer: [
		"Project state (already verified, do not re-check): atmn is installed in",
		"node_modules, a valid AUTUMN_SECRET_KEY is in .env, and the Autumn org",
		"is empty — there is nothing to pull and no dashboard work needed.",
	].join(" "),
});
