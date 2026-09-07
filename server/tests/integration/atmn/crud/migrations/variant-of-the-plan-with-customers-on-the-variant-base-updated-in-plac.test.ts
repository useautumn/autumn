/**
 * atmn crud/migrations — variant of the plan with customers on the variant [base updated in place, base new version] → assert what the server does
 *
 * the `versionedPro` base config: base price, prepaid seat item, usage item, trial, seat license; every line has customers attached
 *
 * One line of plans/atmn-v3/07_tests.md. [a, b] is a matrix looped INSIDE this file.
 */

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
import { runPush } from "../../../../../../packages/atmn-nightly/src/actions/push";
import { createClient } from "../../../../../../packages/atmn-nightly/src/generated/client";

/** `pro` v1 with a nested variant `pro_plus` that has no divergence of its
 * own, so it fully inherits price and items from the base. */
const proWithVariant = ({ amount }: { amount: number }): string => `{
	features: [${everyFeatureType}
	],
	plans: [
		plan({
			planId: "pro",
			versionSlug: "v1",
			name: "Pro",
			price: { amount: ${amount}, interval: "month" },
			items: [{ featureId: "seats", included: 5 }],
			variants: [
				{ variantPlanId: "pro_plus", name: "Pro Plus" },
			],
		}),
	],
}`;

type PreviewMigrations =
	| Array<{ plans: Array<{ planId: string; versions: number[] }> }>
	| undefined;

const targetsPlanV1 = (
	migrations: PreviewMigrations,
	planId: string,
): boolean =>
	(migrations ?? []).some((migration) =>
		migration.plans.some(
			(plan) => plan.planId === planId && plan.versions.includes(1),
		),
	);

test.concurrent(
	`${chalk.yellowBright("atmn crud/migrations: an in-place base price change drafts a migration for the variant's customer")}`,
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
				atmnConfigSource({ body: proWithVariant({ amount: 59 }) }),
			);
			const result = await runPush({ client, cwd: scenario.cwd });

			// Decision pending: the variant inherits the base price (no customize
			// override here), so an in-place base edit is expected to cascade and
			// draft for the variant's own customer.
			expect(
				targetsPlanV1(
					result.preview.migrations as unknown as PreviewMigrations,
					"pro_plus",
				),
			).toBe(true);
		} finally {
			scenario.cleanup();
		}
	},
);

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

			// Mint pro v2; v1 (and the variant hanging off it) becomes history.
			scenario.writeConfig(
				atmnConfigSource({
					body: `{
	plans: [
		plan({
			planId: "pro",
			versionSlug: "v2",
			name: "Pro",
			price: { amount: 59, interval: "month" },
			items: [{ featureId: "seats", included: 5 }],
			variants: [
				{ variantPlanId: "pro_plus", name: "Pro Plus" },
			],
		}),
	],
	planVersions: [
		plan({
			planId: "pro",
			versionSlug: "v1",
			name: "Pro",
			price: { amount: 49, interval: "month" },
			items: [{ featureId: "seats", included: 5 }],
			variants: [
				{ variantPlanId: "pro_plus", name: "Pro Plus" },
			],
		}),
	],
}`,
				}),
			);
			const result = await runPush({ client, cwd: scenario.cwd });

			// Decision pending: minting a version is not an in-place edit — same
			// no-migration shape as a plain plan (see create-a-new-version.test.ts).
			expect(result.preview.migrations ?? []).toEqual([]);
			expect(result.migrationIds).toEqual([]);
		} finally {
			scenario.cleanup();
		}
	},
);
