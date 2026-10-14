import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const twoVersions = `{
	plans: [
		plan({ active: true, planId: "pro", versionSlug: "v2", name: "Pro", price: { amount: 49, interval: "month" } }),
	
		plan({ active: false, planId: "pro", versionSlug: "v1", name: "Pro", price: { amount: 39, interval: "month" } }),
	],
}`;

const activeOnly = `{
	plans: [
		plan({ active: true, planId: "pro", versionSlug: "v2", name: "Pro", price: { amount: 49, interval: "month" } }),
	],
}`;

test.concurrent(
	`${chalk.yellowBright("delete a version with customers: the error names the blocker and both exits")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: `{
	plans: [
		plan({ active: true, planId: "pro", versionSlug: "v1", name: "Pro", price: { amount: 39, interval: "month" } }),
	],
}`,
		});

		try {
			await scenario.push();
			scenario.writeConfig(atmnConfigSource({ body: twoVersions }));
			await scenario.push();
			await scenario.seedCustomer({ planId: "pro", version: 1 });

			scenario.writeConfig(atmnConfigSource({ body: activeOnly }));
			await expect(scenario.push({ dryRun: true })).rejects.toThrow(
				"pro v1 still has customers. Either expire or migrate them and delete the version, or archive all versions of pro to retire the plan.",
			);
		} finally {
			scenario.cleanup();
		}
	},
);
