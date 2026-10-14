import { expect, test } from "bun:test";
import { seedVersionableCustomer } from "@tests/integration/catalog-v2/plans/migrations/utils/seedVersionableCustomer.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import { everyFeatureType } from "@tests/utils/atmnUtils/baseConfigs.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { runPush } from "../../../../../../packages/atmn/src/actions/push";
import { createClient } from "../../../../../../packages/atmn/src/generated/client";

const proWithVariant = ({ amount }: { amount: number }): string => `{
	features: [${everyFeatureType}
	],
	plans: [
		plan({
			active: true,
			planId: "pro",
			versionSlug: "v1",
			name: "Pro",
			price: { amount: ${amount}, interval: "month" },
			items: [{ featureId: "seats", included: 5 }],
			variants: [
				{ variantPlanId: "pro_plus", name: "Pro Plus", versionSlug: "v1" },
			],
		}),
	],
}`;

test.concurrent(
	`${chalk.yellowBright("atmn crud/migrations: minting a new base version drafts nothing for the variant's customer left on v1")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
				}),
			],
			config: {
				raw: atmnConfigSource({ body: proWithVariant({ amount: 49 }) }),
			},
		});
		const client = createClient({
			secretKey: scenario.ctx.orgSecretKey,
			baseUrl: scenario.baseUrl,
		});

		try {
			await scenario.push();
			await seedVersionableCustomer({
				ctx: scenario.ctx,
				planId: "pro_plus",
				version: 1,
			});

			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({
			active: true,
			planId: "pro",
			versionSlug: "v2",
			name: "Pro",
			price: { amount: 59, interval: "month" },
			items: [{ featureId: "seats", included: 5 }],
			variants: [
				{ variantPlanId: "pro_plus", name: "Pro Plus", versionSlug: "v2" },
			],
		}),
	
		plan({
			active: false,
			planId: "pro",
			versionSlug: "v1",
			name: "Pro",
			price: { amount: 49, interval: "month" },
			items: [{ featureId: "seats", included: 5 }],
			variants: [
				{ variantPlanId: "pro_plus", name: "Pro Plus", versionSlug: "v1" },
			],
		}),
	],
}`,
				}),
			);
			const result = await runPush({ client, cwd: scenario.cwd });

			expect(result.preview.migrations ?? []).toEqual([]);
			expect(result.migrationIds).toEqual([]);
		} finally {
			scenario.cleanup();
		}
	},
);
