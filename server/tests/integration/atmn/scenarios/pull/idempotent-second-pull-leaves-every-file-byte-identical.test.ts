/**
 * atmn scenarios/pull — idempotent: second pull leaves every file byte-identical
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	configBody,
	enterpriseWithSeats,
	everyFeatureType,
	seatPlan,
	versionedPro,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

test.concurrent(
	"idempotent: second pull leaves every file byte-identical",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({
				features: everyFeatureType,
				plans: `${versionedPro()}${seatPlan}${enterpriseWithSeats()}`,
			}),
		});

		try {
			await scenario.push();
			// A first pull settles the config into pull's own rendering (internalId
			// order, quoting, etc.) — the claim under test is about the pull AFTER that.
			await scenario.pull();

			const before = scenario.files();
			const second = await scenario.pull();

			expect(second.appended).toEqual([]);
			expect(second.replaced).toEqual([]);
			expect(second.deleted).toEqual([]);
			expect([...scenario.files().entries()]).toEqual([...before.entries()]);
		} finally {
			scenario.cleanup();
		}
	},
);
