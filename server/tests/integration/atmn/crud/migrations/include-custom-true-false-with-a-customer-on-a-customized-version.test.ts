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
import { createClient } from "../../../../../../packages/atmn/src/generated/client";

type PreviewMigrations =
	| Array<{ plans: Array<{ planId: string; versions: number[] }> }>
	| undefined;

const targetsProV1 = (migrations: PreviewMigrations): boolean =>
	(migrations ?? []).some((migration) =>
		migration.plans.some(
			(plan) => plan.planId === "pro" && plan.versions.includes(1),
		),
	);

for (const includeCustom of [true, false] as const) {
	test.concurrent(
		`${chalk.yellowBright(`atmn crud/migrations: migration.include_custom ${includeCustom} — a customized version's customer is ${includeCustom ? "matched" : "skipped"}`)}`,
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
				await seedVersionableCustomer({
					ctx: scenario.ctx,
					planId: "pro",
					version: 1,
					isCustom: true,
				});

				scenario.writeConfig(
					atmnConfigSource({
						body: configBody({
							plans: versionedPro({ versionSlug: "v1", amount: 59 }),
						}),
					}),
				);
				const wire = await scenario.wireFromConfig();
				const customWire = {
					...wire,
					migration: { draft: true, include_custom: includeCustom },
				};

				const preview = (await client.previewUpdate(
					// biome-ignore lint/suspicious/noExplicitAny: hand-built wire override
					customWire as any,
				)) as { migrations?: PreviewMigrations };

				expect(targetsProV1(preview.migrations)).toBe(true);
				type DraftShape = {
					includeCustom?: boolean;
					operations?: {
						customer?: { type?: string; planFilter?: { custom?: boolean } }[];
					};
				};
				const drafts = (preview.migrations ?? []) as unknown as DraftShape[];
				expect(drafts.length).toBeGreaterThan(0);
				for (const draft of drafts) {
					expect(draft.includeCustom ?? false).toBe(includeCustom);
					const updates = (draft.operations?.customer ?? []).filter(
						(operation) => operation.type === "update_plan",
					);
					for (const update of updates) {
						expect(update.planFilter?.custom).toBe(
							includeCustom ? undefined : false,
						);
					}
				}
			} finally {
				scenario.cleanup();
			}
		},
	);
}
