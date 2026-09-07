/**
 * atmn crud/migrations — update all versions [the item added to the v1 and v2 rows in planVersions and the v3 row in plans] → three in-place updates, one migration per customered version, no new version; nothing is asked at push time, the diff says it all
 *
 * the `versionedPro` base config: base price, prepaid seat item, usage item, trial, seat license; every line has customers attached
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { seedVersionableCustomer } from "@tests/integration/catalog-v2/plans/migrations/utils/seedVersionableCustomer.js";
import { uniqueTestId } from "@tests/integration/catalog-v2/utils/uniqueTestId.js";
import {
	configBody,
	everyFeatureType,
	versionedPro,
} from "@tests/utils/atmnUtils/baseConfigs.js";
import {
	atmnConfigSource,
	initAtmnScenario,
} from "@tests/utils/atmnUtils/initAtmnScenario.js";
import { s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { runPush } from "../../../../../../packages/atmn-nightly/src/actions/push";
import { createClient } from "../../../../../../packages/atmn-nightly/src/generated/client";

const EXTRA_ITEM = '\n\t\t\t\t\t{ featureId: "audit_log" },';

/** Every live `pro` version row, oldest first. */
const liveProVersions = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<Array<{ version: number; active: boolean }>> => {
	const products = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: ["pro"],
		returnAll: true,
	});
	return products
		.map((product) => ({ version: product.version, active: product.active }))
		.sort((a, b) => a.version - b.version);
};

type PreviewMigrations =
	| Array<{ plans: Array<{ planId: string; versions: number[] }> }>
	| undefined;

const targetedProVersions = (migrations: PreviewMigrations): number[] =>
	(migrations ?? [])
		.flatMap((migration) => migration.plans)
		.filter((plan) => plan.planId === "pro")
		.flatMap((plan) => plan.versions)
		.sort((a, b) => a - b);

test.concurrent(
	`${chalk.yellowBright("atmn crud/migrations: the same item added to every version in one push is three in-place edits, one migration per customered version")}`,
	async () => {
		const scenario = await initAtmnScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("atmn")}@autumn.test`,
				}),
			],
			config: configBody({
				features: everyFeatureType,
				plans: versionedPro({ versionSlug: "v1" }),
			}),
		});
		const client = createClient({
			secretKey: scenario.ctx.orgSecretKey,
			baseUrl: scenario.baseUrl,
		});

		try {
			await scenario.push();

			// Mint v2 (v1 -> planVersions), then v3 (v2 -> planVersions too).
			scenario.writeConfig(
				atmnConfigSource({
					body: configBody({
						plans: versionedPro({ versionSlug: "v2", amount: 59 }),
						planVersions: versionedPro({ versionSlug: "v1" }),
					}),
				}),
			);
			await scenario.push();

			scenario.writeConfig(
				atmnConfigSource({
					body: configBody({
						plans: versionedPro({ versionSlug: "v3", amount: 69 }),
						planVersions: `${versionedPro({ versionSlug: "v1" })}${versionedPro({ versionSlug: "v2", amount: 59 })}`,
					}),
				}),
			);
			await scenario.push();

			for (const version of [1, 2, 3]) {
				await seedVersionableCustomer({
					ctx: scenario.ctx,
					planId: "pro",
					version,
				});
			}

			// One push, the same item added to all three rows — an in-place edit
			// per row, decided purely from the diff (no extra push-time input).
			scenario.writeConfig(
				atmnConfigSource({
					body: configBody({
						plans: versionedPro({
							versionSlug: "v3",
							amount: 69,
							extraItems: EXTRA_ITEM,
						}),
						planVersions: `${versionedPro({ versionSlug: "v1", extraItems: EXTRA_ITEM })}${versionedPro({ versionSlug: "v2", amount: 59, extraItems: EXTRA_ITEM })}`,
					}),
				}),
			);
			const result = await runPush({ client, cwd: scenario.cwd });

			expect(
				targetedProVersions(
					result.preview.migrations as unknown as PreviewMigrations,
				),
			).toEqual([1, 2, 3]);
			expect(result.migrationIds.length).toBeGreaterThan(0);

			// No new version was minted by an all-versions edit.
			expect(await liveProVersions({ ctx: scenario.ctx })).toEqual([
				{ version: 1, active: false },
				{ version: 2, active: false },
				{ version: 3, active: true },
			]);
		} finally {
			scenario.cleanup();
		}
	},
);
