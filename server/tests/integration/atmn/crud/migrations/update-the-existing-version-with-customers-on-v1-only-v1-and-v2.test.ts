/**
 * atmn crud/migrations — update the existing version with customers on [v1 only, v1 and v2] → one migration per customered version touched
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
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { runPush } from "../../../../../../packages/atmn-nightly/src/actions/push";
import { createClient } from "../../../../../../packages/atmn-nightly/src/generated/client";

type PreviewMigrations =
	| Array<{ plans: Array<{ planId: string; versions: number[] }> }>
	| undefined;

/** Every version of `pro` a migration draft targets, flattened and sorted. */
const targetedProVersions = (migrations: PreviewMigrations): number[] =>
	(migrations ?? [])
		.flatMap((migration) => migration.plans)
		.filter((plan) => plan.planId === "pro")
		.flatMap((plan) => plan.versions)
		.sort((a, b) => a - b);

const customeredVersionCases = [
	{ name: "v1 only", customeredVersions: [1] },
	{ name: "v1 and v2", customeredVersions: [1, 2] },
] as const;

for (const { name, customeredVersions } of customeredVersionCases) {
	test.concurrent(
		`${chalk.yellowBright(`atmn crud/migrations: an in-place edit to both versions drafts one migration per customered version — ${name}`)}`,
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

				// Mint v2; v1 moves into planVersions as history.
				scenario.writeConfig(
					atmnConfigSource({
						body: configBody({
							plans: versionedPro({ versionSlug: "v2", amount: 59 }),
							planVersions: versionedPro({ versionSlug: "v1" }),
						}),
					}),
				);
				await scenario.push();

				for (const version of customeredVersions) {
					await seedVersionableCustomer({
						ctx: scenario.ctx,
						planId: "pro",
						version,
					});
				}

				// Edit both versions in place, in one push.
				scenario.writeConfig(
					atmnConfigSource({
						body: configBody({
							plans: versionedPro({ versionSlug: "v2", amount: 69 }),
							planVersions: versionedPro({ versionSlug: "v1", amount: 19 }),
						}),
					}),
				);
				const result = await runPush({ client, cwd: scenario.cwd });

				expect(
					targetedProVersions(
						result.preview.migrations as unknown as PreviewMigrations,
					),
				).toEqual([...customeredVersions]);
				expect(result.migrationIds).not.toHaveLength(0);

				const [migration] = await migrationRepo.get({
					ctx: scenario.ctx,
					id: result.migrationIds[0],
				});
				expect(migration).toBeDefined();
				expect(migration.archived).toBe(false);
			} finally {
				scenario.cleanup();
			}
		},
	);
}
