import { expect, test } from "bun:test";
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
import { runPush } from "../../../../../../packages/atmn/src/actions/push";
import { createClient } from "../../../../../../packages/atmn/src/generated/client";

const EXTRA_ITEM = '\n\t\t\t\t\t{ featureId: "audit_log" },';

const paths = [
	{
		name: "create a new version",
		nextBody: () =>
			configBody({
				plans: `${versionedPro({ versionSlug: "v2", amount: 59 })}${versionedPro({ versionSlug: "v1", active: false })}`,
			}),
	},
	{
		name: "update the existing version in place",
		nextBody: () =>
			configBody({ plans: versionedPro({ versionSlug: "v1", amount: 59 }) }),
	},
	{
		name: "update all versions",
		nextBody: () =>
			configBody({
				plans: versionedPro({
					versionSlug: "v1",
					extraItems: EXTRA_ITEM,
				}),
			}),
	},
] as const;

for (const { name, nextBody } of paths) {
	test.concurrent(
		`${chalk.yellowBright(`atmn crud/migrations: ${name} drafts nothing on a plan with no customers`)}`,
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

				scenario.writeConfig(atmnConfigSource({ body: nextBody() }));
				const result = await runPush({ client, cwd: scenario.cwd });

				expect(result.preview.migrations ?? []).toEqual([]);
				expect(result.migrationIds).toEqual([]);
			} finally {
				scenario.cleanup();
			}
		},
	);
}
