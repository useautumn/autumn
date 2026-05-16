/**
 * TDD coverage for migrateCustomer preview audit responses.
 *
 * Contract under test:
 *   - response.preview is emitted on migration item events.
 *   - Boolean add/remove item migrations populate flag_changes and no balance_changes.
 *   - Metered grant updates populate balance_changes and omit untouched balances.
 *   - Version migrations populate plan_changes, balance_changes, and flag_changes.
 *   - Entity-scoped customer products surface entity_id on plan_changes.
 */

import { expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

type PreviewPlanChange = {
	action: "created" | "updated" | "deleted";
	plan_id: string;
	entity_id?: string | null;
	item_changes: Array<{
		action: "created" | "deleted";
		feature_id: string;
	}>;
};

type PreviewBalanceChange = {
	feature_id: string;
	granted: number;
	remaining: number;
	usage: number;
	before: {
		granted: number;
		remaining: number;
		usage: number;
	};
};

type PreviewFlagChange = {
	action: "created" | "deleted";
	feature_id: string;
};

type PreviewMigrateCustomer = {
	object: "migration_customer_preview";
	customer_id: string;
	plan_changes: PreviewPlanChange[];
	balance_changes: PreviewBalanceChange[];
	flag_changes: PreviewFlagChange[];
};

type MigrationClient = Awaited<ReturnType<typeof initScenario>>["autumnV2_2"];

const timeout = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

const parseResponse = (response: unknown): Record<string, unknown> => {
	if (typeof response === "string") return JSON.parse(response);
	if (response && typeof response === "object")
		return response as Record<string, unknown>;
	throw new Error(`Invalid migration event response: ${String(response)}`);
};

const waitForPreview = async ({
	autumnV2_2,
	migrationId,
	migrationRunId,
	timeoutMs = 45_000,
}: {
	autumnV2_2: MigrationClient;
	migrationId: string;
	migrationRunId: string;
	timeoutMs?: number;
}): Promise<PreviewMigrateCustomer> => {
	const start = Date.now();
	let lastError: unknown;

	while (Date.now() - start < timeoutMs) {
		try {
			const events = await autumnV2_2.migrationsV2.listItemEvents({
				migrationId,
				migrationRunId,
			});
			const event = events.list[0];
			if (!event) throw new Error("No migration item event found");

			const response = parseResponse(event.response);
			const preview = response.preview;
			if (!preview) throw new Error("Migration item event missing preview");

			return preview as PreviewMigrateCustomer;
		} catch (error) {
			lastError = error;
			await timeout(1_000);
		}
	}

	throw new Error(
		`Timed out waiting for migration preview: ${
			lastError instanceof Error ? lastError.message : String(lastError)
		}`,
	);
};

const runPreviewMigration = async ({
	autumnV2_2,
	migrationId,
	filter,
	operations,
}: {
	autumnV2_2: MigrationClient;
	migrationId: string;
	filter: Parameters<
		MigrationClient["migrationsV2"]["deleteAndCreate"]
	>[0]["filter"];
	operations: Parameters<
		MigrationClient["migrationsV2"]["deleteAndCreate"]
	>[0]["operations"];
}) => {
	const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
		id: migrationId,
		filter,
		operations,
	});
	const runResponse = await autumnV2_2.migrationsV2.run({
		id: migration.id,
		dry_run: true,
	});

	return waitForPreview({
		autumnV2_2,
		migrationId: migration.id,
		migrationRunId: runResponse.run_id,
	});
};

test(`${chalk.yellowBright("migrations preview: boolean item add/remove emits flag changes")}`, async () => {
	const suffix = Date.now();
	const customerId = `migration-preview-flags-${suffix}`;
	const freePlan = products.base({
		id: `migration-preview-flags-plan-${suffix}`,
		items: [items.adminRights()],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [freePlan] })],
		actions: [s.billing.attach({ productId: freePlan.id })],
	});

	const preview = await runPreviewMigration({
		autumnV2_2,
		migrationId: `${customerId}-mig`,
		filter: { customer: { plan: { plan_id: freePlan.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: freePlan.id },
					customize: {
						remove_items: [{ feature_id: TestFeature.AdminRights }],
						add_items: [itemsV2.dashboard()],
					},
				},
			],
		},
	});

	expect(preview.balance_changes).toEqual([]);
	expect(preview.flag_changes).toEqual(
		expect.arrayContaining([
			{ action: "deleted", feature_id: TestFeature.AdminRights },
			{ action: "created", feature_id: TestFeature.Dashboard },
		]),
	);
	expect(preview.plan_changes).toEqual([
		expect.objectContaining({
			action: "updated",
			plan_id: freePlan.id,
			item_changes: expect.arrayContaining([
				{ action: "deleted", feature_id: TestFeature.AdminRights },
				{ action: "created", feature_id: TestFeature.Dashboard },
			]),
		}),
	]);
});

test(`${chalk.yellowBright("migrations preview: metered grant replacement emits balance change only for touched feature")}`, async () => {
	const suffix = Date.now();
	const customerId = `migration-preview-balances-${suffix}`;
	const freePlan = products.base({
		id: `migration-preview-balances-plan-${suffix}`,
		items: [
			items.monthlyCredits({ includedUsage: 100 }),
			items.monthlyMessages({ includedUsage: 50 }),
		],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [freePlan] })],
		actions: [s.billing.attach({ productId: freePlan.id })],
	});

	const preview = await runPreviewMigration({
		autumnV2_2,
		migrationId: `${customerId}-mig`,
		filter: { customer: { plan: { plan_id: freePlan.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: freePlan.id },
					customize: {
						remove_items: [{ feature_id: TestFeature.Credits }],
						add_items: [
							{
								feature_id: TestFeature.Credits,
								included: 300,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				},
			],
		},
	});

	expect(preview.flag_changes).toEqual([]);
	expect(preview.balance_changes).toEqual([
		{
			feature_id: TestFeature.Credits,
			granted: 300,
			remaining: 300,
			usage: 0,
			before: {
				granted: 100,
				remaining: 100,
				usage: 0,
			},
		},
	]);
	expect(
		preview.balance_changes.some(
			(change) => change.feature_id === TestFeature.Messages,
		),
	).toBe(false);
	expect(preview.plan_changes).toEqual([
		expect.objectContaining({
			action: "updated",
			plan_id: freePlan.id,
			item_changes: expect.arrayContaining([
				{ action: "deleted", feature_id: TestFeature.Credits },
				{ action: "created", feature_id: TestFeature.Credits },
			]),
		}),
	]);
});

test(`${chalk.yellowBright("migrations preview: version update emits plan, balance, and flag changes")}`, async () => {
	const suffix = Date.now();
	const customerId = `migration-preview-version-${suffix}`;
	const freePlan = products.base({
		id: `migration-preview-version-plan-${suffix}`,
		items: [items.monthlyMessages({ includedUsage: 100 }), items.adminRights()],
	});

	const { autumnV1, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [freePlan] })],
		actions: [s.billing.attach({ productId: freePlan.id })],
	});

	await autumnV1.products.update(freePlan.id, {
		items: [
			items.monthlyMessages({ includedUsage: 200 }),
			items.monthlyCredits({ includedUsage: 50 }),
		],
	});

	const preview = await runPreviewMigration({
		autumnV2_2,
		migrationId: `${customerId}-mig`,
		filter: { customer: { plan: { plan_id: freePlan.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: freePlan.id },
					version: 2,
				},
			],
		},
	});

	expect(preview.plan_changes.length).toBeGreaterThan(0);
	expect(preview.balance_changes).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				feature_id: TestFeature.Messages,
				granted: 200,
				remaining: 200,
				usage: 0,
				before: {
					granted: 100,
					remaining: 100,
					usage: 0,
				},
			}),
			expect.objectContaining({
				feature_id: TestFeature.Credits,
				granted: 50,
				remaining: 50,
				usage: 0,
				before: {
					granted: 0,
					remaining: 0,
					usage: 0,
				},
			}),
		]),
	);
	expect(preview.flag_changes).toEqual([
		{ action: "deleted", feature_id: TestFeature.AdminRights },
	]);
});

test(`${chalk.yellowBright("migrations preview: plan changes include entity_id")}`, async () => {
	const suffix = Date.now();
	const customerId = `migration-preview-entity-${suffix}`;
	const entityPlan = products.base({
		id: `migration-preview-entity-plan-${suffix}`,
		items: [],
	});

	const { autumnV2_2, entities } = await initScenario({
		customerId,
		setup: [
			s.customer(),
			s.entities({ count: 1, featureId: TestFeature.Users }),
			s.products({ list: [entityPlan] }),
		],
		actions: [
			s.billing.attach({
				productId: entityPlan.id,
				entityIndex: 0,
			}),
		],
	});

	const preview = await runPreviewMigration({
		autumnV2_2,
		migrationId: `${customerId}-mig`,
		filter: { customer: { plan: { plan_id: entityPlan.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: entityPlan.id },
					customize: {
						add_items: [itemsV2.dashboard()],
					},
				},
			],
		},
	});

	expect(preview.plan_changes).toEqual([
		expect.objectContaining({
			action: "updated",
			plan_id: entityPlan.id,
			entity_id: entities[0].id,
		}),
	]);
});
