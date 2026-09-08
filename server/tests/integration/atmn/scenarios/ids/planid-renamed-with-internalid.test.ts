/**
 * atmn scenarios/ids — planId renamed with internalId → same row, versions keep their numbers
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { configBody } from "@tests/utils/atmnUtils/baseConfigs.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

/** Every live version row for a plan_id, oldest first. */
const livePlanVersions = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}): Promise<Array<{ version: number; active: boolean }>> => {
	const products = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: [planId],
		returnAll: true,
	});
	return products
		.map((product) => ({ version: product.version, active: product.active }))
		.sort((a, b) => a.version - b.version);
};

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/ids: renaming planId by internalId keeps the same row and version number")}`,
	async () => {
		const oldId = uniqueTestId("atmn_plan_rn_old");
		const newId = uniqueTestId("atmn_plan_rn_new");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
			],
			config: configBody({
				plans: `\n\t\tplan({ planId: "${oldId}", name: "Plan Rename", price: { amount: 10, interval: "month" } }),`,
			}),
		});

		try {
			await scenario.push();
			const internalId = scenario
				.files()
				.get("autumn.config.ts")
				?.match(new RegExp(`internalId: "([^"]+)", planId: "${oldId}"`))
				?.[1];
			expect(internalId).toBeTruthy();
			expect(
				await livePlanVersions({ ctx: scenario.ctx, planId: oldId }),
			).toEqual([{ version: 1, active: true }]);

			scenario.writeConfig(
				atmnConfigSource({
					body: configBody({
						plans: `\n\t\tplan({ internalId: "${internalId}", planId: "${newId}", name: "Plan Rename", price: { amount: 10, interval: "month" } }),`,
					}),
				}),
			);
			await scenario.push();

			expect(
				await livePlanVersions({ ctx: scenario.ctx, planId: newId }),
			).toEqual([{ version: 1, active: true }]);
			expect(
				await livePlanVersions({ ctx: scenario.ctx, planId: oldId }),
			).toEqual([]);

			const catalog = (await scenario.client.get({})) as {
				plans: Array<{ id: string; internalId: string | null }>;
			};
			expect(catalog.plans.find((plan) => plan.id === newId)?.internalId).toBe(
				internalId,
			);
		} finally {
			scenario.cleanup();
		}
	},
);
