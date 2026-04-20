import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { cleanupFullSubjectScenario } from "./cleanupFullSubjectScenario.js";
import type { FullSubjectScenario } from "./fullSubjectScenarioBuilders.js";
import { insertFullSubjectScenario } from "./insertFullSubjectScenario.js";

export const withInsertedScenario = async ({
	ctx,
	scenario,
	run,
}: {
	ctx: TestContext;
	scenario: FullSubjectScenario;
	run: (params: { scenario: FullSubjectScenario }) => Promise<void>;
}) => {
	await insertFullSubjectScenario({ ctx, scenario });

	try {
		await run({ scenario });
	} finally {
		await cleanupFullSubjectScenario({ ctx, scenario });
	}
};
