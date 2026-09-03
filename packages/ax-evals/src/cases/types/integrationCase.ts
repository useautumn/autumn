import type { Expectation } from "../../grading/types/expectation.ts";
import type { SeedCustomerSpec } from "../../workspace/evalOrg.ts";
import type { Scenario, SimulatedUserBrief } from "./axCase.ts";

/** A request the probe replays against the agent-edited fixture app. */
export type ProbeRequest = {
	path: string;
	method?: string;
	body?: unknown;
	/** replay this request N times (e.g. exhaust a limit); default 1 */
	repeat?: number;
};

/**
 * One integration eval: agent edits a fixture app; grading replays probes
 * against the app and reads the run org (the oracle). Same expectation +
 * arm machinery as catalog cases.
 */
export type IntegrationCase = {
	name: string;
	fixture: "notes-api";
	/** the catalog this org starts with, as an autumn.config.ts to push */
	catalogConfig: string;
	prompt: string;
	simulatedUser?: SimulatedUserBrief;
	/** starting world, same shape as catalog cases (primer etc.) */
	scenario?: Scenario;
	/** files written over the fixture before the agent starts (path → content)
	 * — pins deterministic contracts (stub routes) so prompts can stay vague */
	existingFiles?: Record<string, string>;
	/** seed an "existing subscriber" into the org before the agent starts */
	seedCustomer?: SeedCustomerSpec;
	probes: ProbeRequest[];
	/** the customer id the oracle reads after probing */
	oracleCustomerId: string;
	expect: Expectation[];
	/** a known-correct fixture patch used to prove the graders (path → content) */
	goldenFiles?: Record<string, string>;
};
