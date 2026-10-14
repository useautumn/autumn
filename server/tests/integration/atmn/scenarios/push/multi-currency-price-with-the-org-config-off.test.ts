import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

test("multi-currency price with the org config off → clean error, not a crash", async () => {
	const planId = uniqueTestId("atmn_multi_currency");

	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
		],
		config: configBody({
			plans: `
		plan({
			active: true,
			planId: "${planId}",
			name: "Pro",
			versionSlug: "v1",
			price: {
				amount: 49,
				interval: "month",
				additionalCurrencies: [{ currency: "eur", amount: 45 }],
			},
			items: [],
		}),`,
		}),
	});

	try {
		const before = scenario.files();

		let thrown: Error | undefined;
		try {
			await scenario.push();
		} catch (error) {
			thrown = error as Error;
		}

		expect(thrown).toBeDefined();
		expect(thrown?.message).toMatch(
			/\/v1\/catalogV2\.preview_update failed \(400\): /,
		);

		expect([...scenario.files().entries()]).toEqual([...before.entries()]);

		const catalog = (await scenario.client.get({})) as unknown as {
			plans: Array<{ id: string }>;
		};
		expect(catalog.plans.some((row) => row.id === planId)).toBe(false);
	} finally {
		scenario.cleanup();
	}
});
