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
import { runPush } from "../../../../../../packages/atmn/src/actions/push";
import { createClient } from "../../../../../../packages/atmn/src/generated/client";

type PreviewMigrations =
	| Array<{ plans: Array<{ planId: string; versions: number[] }> }>
	| undefined;

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

				scenario.writeConfig(
					atmnConfigSource({
						body: configBody({
							plans: `${versionedPro({ versionSlug: "v2", amount: 59 })}${versionedPro({ versionSlug: "v1", active: false })}`,
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

				scenario.writeConfig(
					atmnConfigSource({
						body: configBody({
							plans: `${versionedPro({ versionSlug: "v2", amount: 69 })}${versionedPro({ versionSlug: "v1", amount: 19, active: false })}`,
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
