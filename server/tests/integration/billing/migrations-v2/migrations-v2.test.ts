import { expect, test } from "bun:test";
import {
	ErrCode,
	MigrationItemKind,
	MigrationItemRunStatus,
	migrations,
} from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService.js";
import { migrationItemRunRepo } from "@/internal/migrations/v2/repos/index.js";

/**
 * TDD coverage for migration draft CRUD used by the dashboard.
 *
 * Contract under test:
 *   New fields:
 *     - migrations.archived: boolean, default false.
 *   New behaviors:
 *     - PATCH /migrations.update accepts updates.archived.
 *     - POST /migrations.delete hard-deletes migrations with no customer runs.
 *     - POST /migrations.delete rejects migrations with customer run history.
 *   Side effects:
 *     - Rejected deletes keep the migration row and run history unchanged.
 */

test.concurrent(
	`${chalk.yellowBright("migrations.update: persists no_billing_changes from dashboard PATCH")}`,
	async () => {
		const customerId = "migrations-update-no-billing";
		const migrationId = `${customerId}-mig`;

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer()],
			actions: [],
		});

		await autumnV2_2.migrationsV2.deleteAndCreate({ id: migrationId });
		const updated = await autumnV2_2.migrationsV2.update({
			id: migrationId,
			updates: { no_billing_changes: true },
		});

		expect(updated.no_billing_changes).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("migrations.delete: hard deletes drafts that have no customer runs")}`,
	async () => {
		const customerId = "migrations-delete-draft";
		const migrationId = `${customerId}-mig`;

		const { autumnV2_2 } = await initScenario({
			customerId,
			setup: [s.customer()],
			actions: [],
		});

		await autumnV2_2.migrationsV2.deleteAndCreate({ id: migrationId });
		const deleted = await autumnV2_2.migrationsV2.delete({ id: migrationId });
		const list = await autumnV2_2.migrationsV2.list();

		expect(deleted.id).toBe(migrationId);
		expect(deleted.archived).toBe(false);
		expect(list.list.some((migration) => migration.id === migrationId)).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("migrations.delete: rejects migrations that have customer runs")}`,
	async () => {
		const customerId = `migrations-delete-reject-${Date.now()}`;
		const migrationId = `${customerId}-mig`;

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer()],
			actions: [],
		});

		const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
			id: migrationId,
		});
		const customer = await CusService.get({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		if (!customer) throw new Error(`Expected customer ${customerId}`);

		await migrationItemRunRepo.markSucceeded({
			ctx,
			migrationInternalId: migration.internal_id,
			itemKind: MigrationItemKind.Customer,
			itemId: customer.internal_id,
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "has customer run history and cannot be deleted",
			func: () => autumnV2_2.migrationsV2.delete({ id: migrationId }),
		});
		const list = await autumnV2_2.migrationsV2.list();
		const preserved = list.list.find((candidate) => candidate.id === migrationId);

		expect(preserved).toMatchObject({ id: migrationId, archived: false });
		expect(
			await migrationItemRunRepo.getCustomer({
				ctx,
				migrationInternalId: migration.internal_id,
				internalCustomerId: customer.internal_id,
			}),
		).toMatchObject({ status: MigrationItemRunStatus.Succeeded });
	},
);

test.concurrent(
	`${chalk.yellowBright("migrations.update: persists archived from dashboard PATCH")}`,
	async () => {
		const customerId = `migrations-update-archived-${Date.now()}`;
		const migrationId = `${customerId}-mig`;

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [s.customer()],
			actions: [],
		});

		await autumnV2_2.migrationsV2.deleteAndCreate({ id: migrationId });
		const updated = await autumnV2_2.migrationsV2.update({
			id: migrationId,
			updates: { archived: true },
		});
		const [row] = await ctx.db
			.select()
			.from(migrations)
			.where(eq(migrations.id, migrationId));

		expect(updated.archived).toBe(true);
		expect(row?.archived).toBe(true);
	},
);
