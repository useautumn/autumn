/**
 * atmn scenarios/push — push twice → second preview is all `none`
 *
 * One line of plans/atmn-v3/07_tests.md.
 */

import { expect, test } from "bun:test";
import {
	configBody,
	everyFeatureType,
	freePlan,
	paidMonthly,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectPreviewNone } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

test("push twice → second preview is all `none`", async () => {
	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({ userEmail: "atmn-push-twice@autumn.test" }),
		],
		config: configBody({
			features: everyFeatureType,
			plans: `${freePlan}${paidMonthly()}`,
		}),
	});

	try {
		const first = await scenario.push();
		expect(first.output).not.toContain("No changes.");

		const second = await scenario.push();
		expect(second.output).toContain("No changes.");
		expect(second.migrationIds).toEqual([]);

		// Not just the CLI's own render: the server's preview itself says none.
		await expectPreviewNone({
			client: scenario.client,
			wire: await scenario.wireFromConfig(),
		});
	} finally {
		scenario.cleanup();
	}
});
