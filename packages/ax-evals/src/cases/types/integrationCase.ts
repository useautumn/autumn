import type { Expectation } from "../../grading/types/expectation.ts";
import type { SeedCustomerSpec } from "../../workspace/evalOrg.ts";
import type { Scenario, SimulatedUserBrief } from "./axCase.ts";

export type ProbeRequest = {
	path: string;
	method?: string;
	body?: unknown;
	repeat?: number;
};

export type IntegrationCase = {
	name: string;
	fixture: "notes-api";
	catalogConfig: string;
	prompt: string;
	simulatedUser?: SimulatedUserBrief;
	scenario?: Scenario;
	existingFiles?: Record<string, string>;
	seedCustomer?: SeedCustomerSpec;
	probes: ProbeRequest[];
	oracleCustomerId: string;
	expect: Expectation[];
	goldenFiles?: Record<string, string>;
};
