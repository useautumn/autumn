/**
 * atmn scenarios/archive — second push after a restore → all `none`
 *
 * one push carries the whole batch, so restore order must not matter
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	enterpriseWithSeats,
	everyFeatureType,
	seatPlan,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectPreviewNone } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/archive: re-pushing the same config after a restore previews nothing further")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{ features: [${everyFeatureType}], plans: [${seatPlan}${enterpriseWithSeats({})}] }`,
		});

		try {
			await scenario.push();

			// The parent also clears its licenses[] in the same push: the
			// anchor-lifecycle guard reads the still-declared link regardless of
			// the parent's own archived state, so archiving both together needs
			// the unlink to be same-call.
			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({ active: true, planId: "seat", versionSlug: "v1", archived: true }),
		plan({ active: true, planId: "enterprise", versionSlug: "v1", archived: true, licenses: [] }),
	],
}`,
				}),
			);
			await scenario.push();

			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({ active: true, planId: "seat", versionSlug: "v1", archived: false }),
		plan({ active: true, planId: "enterprise", versionSlug: "v1", archived: false, licenses: [{ licensePlanId: "seat", included: 25 }] }),
	],
}`,
				}),
			);
			await scenario.push();

			// The exact same restore, pushed again — nothing left to apply.
			await scenario.push();
			await expectPreviewNone({
				client: scenario.client,
				wire: await scenario.wireFromConfig(),
			});
		} finally {
			scenario.cleanup();
		}
	},
);
