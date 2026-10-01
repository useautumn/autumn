/**
 * atmn crud/variants — variant [renamed, archived]
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";

const baseConfig = `{
	plans: [
		plan({
			active: true,
			planId: "base",
			name: "Base",
			versionSlug: "v1",
			price: { amount: 49, interval: "month" },
			variants: [
				{
					variantPlanId: "addon",
					name: "Addon",
					versionSlug: "v1",
					customize: { price: { amount: 79, interval: "month" } },
				},
			],
		}),
	],
}`;

test.concurrent(`${chalk.yellowBright("variant archived")}`, async () => {
	const scenario = await initAtmnScenario({
		setup: [
			s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
		],
		config: baseConfig,
	});

	try {
		await scenario.push();
		const before = await ProductService.getFull({
			db: scenario.ctx.db,
			orgId: scenario.ctx.org.id,
			env: scenario.ctx.env,
			idOrInternalId: "addon",
		});

		scenario.writeConfig(
			atmnConfigSource({
				body: `{
	plans: [
		plan({
			active: true,
			planId: "base",
			name: "Base",
			versionSlug: "v1",
			price: { amount: 49, interval: "month" },
			variants: [
				{ variantPlanId: "addon", versionSlug: "v1", archived: true },
			],
		}),
	],
}`,
			}),
		);
		await scenario.push();

		const archived = await ProductService.getFull({
			db: scenario.ctx.db,
			orgId: scenario.ctx.org.id,
			env: scenario.ctx.env,
			idOrInternalId: "addon",
		});
		expect(archived.internal_id).toBe(before.internal_id);
		expect(archived.archived).toBe(true);
		expect(archived.base_internal_product_id).toBe(
			before.base_internal_product_id,
		);
	} finally {
		scenario.cleanup();
	}
});
