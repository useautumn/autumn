import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import { initAtmnScenario } from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";

const proPlanWithUnknownPrice = `
		plan({
			active: true,
			planId: "pro",
			name: "Pro",
			versionSlug: "v1",
			price: {
				amount: 49,
				interval: "month",
				processors: { stripe: { priceId: "price_atmn_does_not_exist_123" } },
			},
		}),`;

test.concurrent(
	"adopting an unknown Stripe price id surfaces a clean error",
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({ plans: proPlanWithUnknownPrice }),
		});

		try {
			await expect(scenario.push()).rejects.toThrow(
				/price_atmn_does_not_exist_123/,
			);
		} finally {
			scenario.cleanup();
		}
	},
);
