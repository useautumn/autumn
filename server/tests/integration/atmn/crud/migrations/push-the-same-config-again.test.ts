/**
 * atmn crud/migrations — push the same config again → no second migration
 *
 * the `versionedPro` base config: base price, prepaid seat item, usage item, trial, seat license; every line has customers attached
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

import { expect, test } from "bun:test";
import { migrations as migrationsTable } from "@autumn/shared";
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
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { runPush } from "../../../../../../packages/atmn-nightly/src/actions/push";
import { createClient } from "../../../../../../packages/atmn-nightly/src/generated/client";

const migrationRowCount = async ({
	ctx,
}: {
	ctx: AutumnContext;
}): Promise<number> => {
	const rows = await ctx.db
		.select()
		.from(migrationsTable)
		.where(
			and(
				eq(migrationsTable.org_id, ctx.org.id),
				eq(migrationsTable.env, ctx.env),
			),
		);
	return rows.length;
};

test.concurrent(
	`${chalk.yellowBright("atmn crud/migrations: re-pushing an already-applied in-place edit drafts no second migration")}`,
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
			});

			scenario.writeConfig(
				atmnConfigSource({
					body: configBody({
						plans: versionedPro({ versionSlug: "v1", amount: 59 }),
					}),
				}),
			);
			const first = await runPush({ client, cwd: scenario.cwd });
			expect(first.migrationIds.length).toBeGreaterThan(0);
			expect(await migrationRowCount({ ctx: scenario.ctx })).toBe(1);

			// Same config, unchanged — the diff is empty, so nothing drafts again.
			const second = await runPush({ client, cwd: scenario.cwd });
			expect(second.preview.migrations ?? []).toEqual([]);
			expect(second.migrationIds).toEqual([]);
			expect(await migrationRowCount({ ctx: scenario.ctx })).toBe(1);
		} finally {
			scenario.cleanup();
		}
	},
);
