/**
 * atmn crud/plans — free no items
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

test.concurrent("free no items", async () => {
	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
		],
		config: configBody({
			plans: `
		plan({
			planId: "free",
			name: "Free",
			items: [],
		}),`,
		}),
	});

	try {
		const { freshWire } = await expectRoundTrip({ scenario });
		const plans = freshWire.plans as Array<Record<string, unknown>>;
		const free = plans.find((plan) => plan.plan_id === "free");
		expect(free).toEqual(expect.objectContaining({ items: [] }));
	} finally {
		scenario.cleanup();
	}
});
