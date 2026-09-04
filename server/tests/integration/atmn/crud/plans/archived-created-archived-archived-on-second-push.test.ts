/**
 * atmn crud/plans — archived [created archived, archived on second push]
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { configBody, paidMonthly } from "@tests/utils/atmnUtils/baseConfigs.js";
import { expectRoundTrip } from "@tests/utils/atmnUtils/expectRoundTrip.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

const setup = () => [
	s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
];

test.concurrent("archived: created archived", async () => {
	const scenario = await initAtmnScenario({
		setup: setup(),
		config: configBody({
			plans: paidMonthly({ extra: "\n\t\t\t\tarchived: true," }),
		}),
	});

	try {
		const { freshWire } = await expectRoundTrip({ scenario });
		const plans = freshWire.plans as Array<Record<string, unknown>>;
		const pro = plans.find((plan) => plan.plan_id === "pro");
		expect(pro).toEqual(expect.objectContaining({ archived: true }));
	} finally {
		scenario.cleanup();
	}
});

test.concurrent("archived: archived on second push", async () => {
	const scenario = await initAtmnScenario({
		setup: setup(),
		config: configBody({ plans: paidMonthly() }),
	});

	try {
		await scenario.push();

		scenario.writeConfig(
			atmnConfigSource({
				body: configBody({
					plans: paidMonthly({ extra: "\n\t\t\t\tarchived: true," }),
				}),
			}),
		);

		const { freshWire } = await expectRoundTrip({ scenario });
		const plans = freshWire.plans as Array<Record<string, unknown>>;
		const pro = plans.find((plan) => plan.plan_id === "pro");
		expect(pro).toEqual(expect.objectContaining({ archived: true }));
	} finally {
		scenario.cleanup();
	}
});
