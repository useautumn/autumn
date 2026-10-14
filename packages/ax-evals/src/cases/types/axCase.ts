import type { Expectation } from "../../grading/types/expectation.ts";
import type { SeedCustomerSpec } from "../../workspace/evalOrg.ts";

export type Scenario = {
	primer?: string;
	seedConfig?: false;
	seedCatalog?: string;
	withStripe?: boolean;
	seedCustomers?: SeedCustomerSpec[];
	beforeAgent?: (org: {
		backendUrl: string;
		secretKey: string;
	}) => Promise<void>;
	captureCatalog?: boolean;
};

export type SimulatedUserBrief = {
	goal: string;
	facts: string;
	maxUserTurns?: number;
	approvesPush?: boolean;
};

export type AxCase = {
	name: string;
	prompt: string;
	followUpMessages?: string[];
	simulatedUser?: SimulatedUserBrief;
	scenario?: Scenario;
	existingFiles?: Record<string, string>;
	expect: Expectation[];
	goldenConfig?: string;
};
