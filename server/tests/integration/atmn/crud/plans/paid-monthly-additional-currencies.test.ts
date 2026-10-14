import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

test.concurrent(
	"paid [monthly] [additional currencies] → clean error while org multi-currency is off",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
				}),
			],
			config: configBody({
				plans: `
		plan({
			active: true,
			planId: "pro",
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
			await expect(scenario.push()).rejects.toThrow(
				/\/v1\/catalogV2\.preview_update failed \(400\)/,
			);
		} finally {
			scenario.cleanup();
		}
	},
);
