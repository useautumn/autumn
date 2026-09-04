/**
 * atmn crud/plans — default plan / auto enable
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

test.concurrent("default plan / auto enable", async () => {
	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
		],
		config: configBody({
			plans: `
		plan({
			planId: "starter",
			name: "Starter",
			isDefault: true,
			items: [],
		}),
		plan({
			planId: "pro",
			name: "Pro",
			price: { amount: 49, interval: "month" },
			// auto_enable falls back into is_default absent an explicit isDefault,
			// so a paid auto-enable plan needs a cardless trial to pass that rule.
			freeTrial: { durationLength: 14, durationType: "day", cardRequired: false },
			autoEnable: true,
			items: [],
		}),`,
		}),
	});

	try {
		const { freshWire } = await expectRoundTrip({ scenario });
		const plans = freshWire.plans as Array<Record<string, unknown>>;
		const starter = plans.find((plan) => plan.plan_id === "starter");
		const pro = plans.find((plan) => plan.plan_id === "pro");
		// isDefault and autoEnable both write the same underlying flag; the catalog
		// only ever reports it back as auto_enable, never is_default.
		expect(starter).toEqual(expect.objectContaining({ auto_enable: true }));
		expect(pro).toEqual(expect.objectContaining({ auto_enable: true }));
	} finally {
		scenario.cleanup();
	}
});
