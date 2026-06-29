import type { TestContext } from "../../../../../server/tests/utils/testInitUtils/createTestContext.js";

export type AtmnSeedResult = {
	ctx: TestContext;
	customerId?: string;
};

export interface AtmnScenario {
	key: string;
	description: string;
	seed: (params: { ctx: TestContext }) => Promise<AtmnSeedResult>;
	assertPushed?: (params: { ctx: TestContext }) => Promise<void>;
}
