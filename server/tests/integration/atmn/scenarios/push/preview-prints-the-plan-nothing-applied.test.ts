/**
 * atmn scenarios/push — preview prints the plan, nothing applied
 *
 * One line of plans/atmn-v3/07_tests.md.
 */

import { expect, test } from "bun:test";
import {
	configBody,
	freePlan,
	paidMonthly,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

test("preview prints the plan, nothing applied", async () => {
	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({ userEmail: "atmn-preview@autumn.test" }),
		],
		config: configBody({ plans: `${freePlan}${paidMonthly()}` }),
	});

	try {
		const result = await scenario.push({ dryRun: true });

		expect(result.output).toContain("Plans (2)");
		expect(result.output).toContain("free");
		expect(result.output).toContain("pro");
		expect(result.output).toContain("Dry run — nothing applied.");
		expect(result.migrationIds).toEqual([]);

		// Preview only — the org's catalog stays empty.
		const catalog = (await scenario.client.get({})) as unknown as {
			plans: Array<{ id: string }>;
		};
		expect(catalog.plans).toEqual([]);
	} finally {
		scenario.cleanup();
	}
});
