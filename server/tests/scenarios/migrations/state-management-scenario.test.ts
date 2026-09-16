import { test } from "bun:test";
import { MigrationRunStatus } from "@autumn/shared";
import { waitForMigrationResult } from "@tests/integration/billing/migrations-v2/utils/runUpdatePlanMigration";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { migrationRunRepo } from "@/internal/migrations/v2/repos/index.js";

/**
 * QA setup for migration state management (status, frozen list, skip
 * reasons, version warning).
 *
 *   plan qa-starter  v1: 100 messages          v2: 200 messages + dashboard (latest)
 *   plan qa-other    v1: 100 messages
 *
 *   qa-v1-a, qa-v1-b   plain on starter v1
 *   qa-v1-dash         starter v1 with a custom dashboard item (already has it)
 *   qa-v2              plain on starter v2
 *   qa-other           plain on the other plan
 *
 *   qa-draft   draft — add dashboard to starter; never run (live filter, Run All)
 *   qa-version draft — starter v1 → v2 with no customize (version-only warning)
 *   qa-ran     run   — Run All executed: qa-v1-a/b succeeded, qa-v1-dash
 *                      no_updates_needed, qa-v2 and qa-other ineligible
 */
test(`${chalk.yellowBright("migration-setup: state management QA")}`, async () => {
	const starter = products.base({
		id: "starter",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const other = products.base({
		id: "other",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId: "qa-v1-a",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [starter, other], prefix: "qa" }),
			s.otherCustomers([
				{ id: "qa-v1-b", paymentMethod: "success" },
				{ id: "qa-v1-dash", paymentMethod: "success" },
				{ id: "qa-v2", paymentMethod: "success" },
				{ id: "qa-other", paymentMethod: "success" },
			]),
		],
		actions: [
			s.billing.attach({ productId: starter.id }),
			s.billing.attach({ customerId: "qa-v1-b", productId: starter.id }),
			s.billing.attach({
				customerId: "qa-v1-dash",
				productId: starter.id,
				items: [
					items.monthlyMessages({ includedUsage: 100 }),
					items.dashboard(),
				],
			}),
			s.billing.attach({ customerId: "qa-other", productId: other.id }),
		],
	});

	await autumnV1.products.update(starter.id, {
		items: [items.monthlyMessages({ includedUsage: 200 }), items.dashboard()],
	});
	await autumnV1.billing.attach({
		customer_id: "qa-v2",
		product_id: starter.id,
	});

	await autumnV2_2.migrationsV2.create({
		id: "qa-draft",
		filter: { customer: { plan: { plan_id: starter.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: starter.id },
					customize: { add_items: [itemsV2.dashboard()] },
				},
			],
		},
		no_billing_changes: true,
	});

	await autumnV2_2.migrationsV2.create({
		id: "qa-version",
		filter: { customer: { plan: { plan_id: starter.id, version: 1 } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: starter.id, version: 1 },
					version: 2,
				},
			],
		},
		no_billing_changes: true,
	});

	const ran = await autumnV2_2.migrationsV2.create({
		id: "qa-ran",
		filter: {
			customer: { plan: { plan_id: { $in: [starter.id, other.id] } } },
		},
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: starter.id, version: 1 },
					customize: { add_items: [itemsV2.dashboard()] },
				},
			],
		},
		no_billing_changes: true,
	});
	const run = await autumnV2_2.migrationsV2.run({ id: ran.id, dry_run: false });
	await waitForMigrationResult({
		timeoutMs: 120_000,
		pollIntervalMs: 2_000,
		waitFor: async () => {
			const [row] = await migrationRunRepo.list({
				ctx,
				internalId: run.run_id,
			});
			if (row?.status !== MigrationRunStatus.Succeeded)
				throw new Error(`qa-ran still ${row?.status}`);
		},
	});

	console.log(
		chalk.green(
			[
				"[migration-setup] qa-draft (Draft, live filter), qa-version (Draft, version-only warning),",
				"qa-ran (Run, frozen list: qa-v1-a/b passed, qa-v1-dash no changes, qa-other ineligible).",
				"Waiting state: start Run All on qa-draft, then immediately on qa-version.",
			].join("\n"),
		),
	);
});
