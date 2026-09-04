/**
 * atmn crud/migrations — update the existing version in place [price changed, item added, item removed, trial changed, license included changed] with customers on it → migration drafted: preview names it, applied result names it, one undrafted migration row persists
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
	seatPlan,
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

const targetsProV1 = (migrations: PreviewMigrations): boolean =>
	(migrations ?? []).some((migration) =>
		migration.plans.some(
			(plan) => plan.planId === "pro" && plan.versions.includes(1),
		),
	);

const TRIAL_FIELD =
	'freeTrial: { durationLength: 14, durationType: "day", cardRequired: true, onEnd: "bill" },';

/** `pro` v1 with a longer trial — `versionedPro` only parameterizes price/items. */
const withLongerTrial = (): string =>
	versionedPro({ versionSlug: "v1" }).replace(
		TRIAL_FIELD,
		'freeTrial: { durationLength: 30, durationType: "day", cardRequired: true, onEnd: "bill" },',
	);

/** `pro` v1 licensing `seat` — `versionedPro` has no `licenses` key to parameterize. */
const withLicense = ({ included }: { included: number }): string =>
	versionedPro({ versionSlug: "v1" }).replace(
		"billingControls: {",
		`licenses: [{ licensePlanId: "seat", included: ${included} }],\n\t\t\tbillingControls: {`,
	);

const EXTRA_ITEM = '\n\t\t\t\t\t{ featureId: "audit_log" },';

type Case = {
	name: string;
	before: string;
	after: string;
	needsLicense?: boolean;
};

const cases: Case[] = [
	{
		name: "price changed",
		before: versionedPro({ versionSlug: "v1" }),
		after: versionedPro({ versionSlug: "v1", amount: 59 }),
	},
	{
		name: "item added",
		before: versionedPro({ versionSlug: "v1" }),
		after: versionedPro({ versionSlug: "v1", extraItems: EXTRA_ITEM }),
	},
	{
		name: "item removed",
		before: versionedPro({ versionSlug: "v1", extraItems: EXTRA_ITEM }),
		after: versionedPro({ versionSlug: "v1" }),
	},
	{
		name: "trial changed",
		before: versionedPro({ versionSlug: "v1" }),
		after: withLongerTrial(),
	},
	{
		name: "license included changed",
		before: withLicense({ included: 10 }),
		after: withLicense({ included: 25 }),
		needsLicense: true,
	},
];

for (const { name, before, after, needsLicense = false } of cases) {
	test.concurrent(
		`${chalk.yellowBright(`atmn crud/migrations: an in-place ${name} on a customered version drafts a migration`)}`,
		async () => {
			const scenario = await initAtmnScenario({
				setup: [
					s.platform.create({
						userEmail: `${uniqueTestId("atmn")}@autumn.test`,
					}),
					// The one real billing attach in this file — every other case uses
					// the cheap DB-only seed to keep the matrix fast.
					...(name === "price changed"
						? [s.customer({ paymentMethod: "success" })]
						: []),
				],
				config: configBody({
					features: everyFeatureType,
					plans: needsLicense ? `${seatPlan}${before}` : before,
				}),
			});
			const client = createClient({
				secretKey: scenario.ctx.orgSecretKey,
				baseUrl: scenario.baseUrl,
			});

			try {
				await scenario.push();

				if (name === "price changed") {
					await scenario.attachCustomer({ planId: "pro" });
				} else {
					await seedVersionableCustomer({
						ctx: scenario.ctx,
						planId: "pro",
						version: 1,
					});
				}

				scenario.writeConfig(
					atmnConfigSource({
						body: configBody({
							plans: needsLicense ? `${seatPlan}${after}` : after,
						}),
					}),
				);
				const result = await runPush({ client, cwd: scenario.cwd });

				expect(
					targetsProV1(
						result.preview.migrations as unknown as PreviewMigrations,
					),
				).toBe(true);
				expect(result.migrationIds).not.toHaveLength(0);
				expect(result.applied).toBeDefined();

				const [migration] = await migrationRepo.get({
					ctx: scenario.ctx,
					id: result.migrationIds[0],
				});
				expect(migration).toBeDefined();
				// A migration row has no explicit status column — `archived: false` is
				// what a freshly persisted draft looks like before anyone runs it.
				expect(migration.archived).toBe(false);
			} finally {
				scenario.cleanup();
			}
		},
	);
}
