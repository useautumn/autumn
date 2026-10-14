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

const withLongerTrial = (): string =>
	versionedPro({ versionSlug: "v1" }).replace(
		TRIAL_FIELD,
		'freeTrial: { durationLength: 30, durationType: "day", cardRequired: true, onEnd: "bill" },',
	);

const withLicense = ({ included }: { included: number }): string =>
	versionedPro({ versionSlug: "v1" }).replace(
		"billingControls: {",
		`licenses: [{ licensePlanId: "seat", versionSlug: "v1", included: ${included} }],\n\t\t\tbillingControls: {`,
	);

const EXTRA_ITEM = '\n\t\t\t\t\t{ featureId: "audit_log" },';

type Case = {
	name: string;
	before: string;
	after: string;
	needsLicense?: boolean;
	pending?: string;
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
		pending: "decide whether a trial-only edit drafts a migration",
	},
	{
		name: "license included changed",
		before: withLicense({ included: 10 }),
		after: withLicense({ included: 25 }),
		needsLicense: true,
	},
];

for (const { name, before, after, needsLicense = false, pending } of cases) {
	if (pending !== undefined) {
		test.todo(
			`atmn crud/migrations: an in-place ${name} on a customered version drafts a migration (${pending})`,
			() => {},
		);
		continue;
	}
	test.concurrent(
		`${chalk.yellowBright(`atmn crud/migrations: an in-place ${name} on a customered version drafts a migration`)}`,
		async () => {
			const scenario = await initAtmnScenario({
				setup: [
					s.platform.create({
						userEmail: `${uniqueTestId("atmn")}@autumn.test`,
					}),
					...(name === "price changed"
						? [s.customer({ paymentMethod: "success" })]
						: []),
				],
				config: configBody({
					features: everyFeatureType,
					plans: needsLicense ? `${seatPlan}${before}` : before,
				}),
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
				const preview = await scenario.preview();

				expect(
					targetsProV1(preview.migrations as unknown as PreviewMigrations),
				).toBe(true);

				const result = await scenario.push();

				expect(result.migrationIds, result.output).not.toHaveLength(0);

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
