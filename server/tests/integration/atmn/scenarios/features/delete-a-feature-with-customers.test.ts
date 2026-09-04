/**
 * atmn scenarios/features — delete a feature with customers → archived, preview says will_archive
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
import { FeatureService } from "@/internal/features/FeatureService.js";
import { uniqueTestId } from "../../../catalog-v2/utils/uniqueTestId.js";

test.concurrent(
	`${chalk.yellowBright("atmn scenarios/features: deleting a feature a customer holds archives it, preview says will_archive")}`,
	async () => {
		const featureId = uniqueTestId("atmn_del_cust");
		const planId = uniqueTestId("atmn_del_cust_plan");

		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({ userEmail: `${uniqueTestId("atmn")}@autumn.test` }),
				s.customer(),
			],
			config: configBody({
				features: `\n\t\tfeature({ featureId: "${featureId}", name: "Delete With Customer", type: "metered", consumable: true }),`,
				plans: `\n\t\tplan({ planId: "${planId}", name: "Delete With Customer Plan", items: [{ featureId: "${featureId}", included: 100 }] }),`,
			}),
		});

		try {
			await scenario.push();
			await scenario.attachCustomer({ planId });

			// The feature drops out of `features`, and its item drops from the
			// plan too — the only remaining reference is the customer's history.
			scenario.writeConfig(
				atmnConfigSource({
					body: configBody({
						features: "",
						plans: `\n\t\tplan({ planId: "${planId}", name: "Delete With Customer Plan" }),`,
					}),
				}),
			);

			const wire = await scenario.wireFromConfig();
			const preview = (await scenario.client.previewUpdate(wire)) as {
				features: Array<{
					featureId: string;
					action?: string;
					state: { hasCustomers: boolean; willArchive?: boolean };
				}>;
			};
			const previewRow = preview.features.find(
				(row) => row.featureId === featureId,
			);
			expect(previewRow).toEqual(
				expect.objectContaining({
					action: "delete",
					state: expect.objectContaining({
						hasCustomers: true,
						willArchive: true,
					}),
				}),
			);

			await scenario.push();

			const dbFeatures = await FeatureService.list({
				db: scenario.ctx.db,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
			});
			expect(
				dbFeatures.find((feature) => feature.id === featureId)?.archived,
			).toBe(true);

			const catalog = (await scenario.client.get({})) as {
				features: Array<{ id: string }>;
			};
			expect(catalog.features.map((feature) => feature.id)).not.toContain(
				featureId,
			);
		} finally {
			scenario.cleanup();
		}
	},
);
