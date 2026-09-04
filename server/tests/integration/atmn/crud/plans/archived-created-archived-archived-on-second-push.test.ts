/**
 * atmn crud/plans — archived [archived on second push]
 *
 * One line of plans/atmn-v3/07_tests.md. Creating a plan archived from
 * scratch is unsupported by decision, so only the second-push cell remains.
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

/** Pull excludes archived rows from the config (server history, not something
 * to write); the catalog get, not the pulled wire, is the source of truth. */
type CatalogPlanRow = { id: string; archived?: boolean };

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

		await expectRoundTrip({ scenario });
		const catalog = (await scenario.client.get({
			include_archived: true,
		})) as unknown as { plans: CatalogPlanRow[] };
		const pro = catalog.plans.find((plan) => plan.id === "pro");
		expect(pro?.archived).toBe(true);
	} finally {
		scenario.cleanup();
	}
});
