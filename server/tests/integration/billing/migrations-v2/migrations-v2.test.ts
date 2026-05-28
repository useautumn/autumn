/**
 * TDD coverage for migration draft CRUD used by the dashboard.
 *
 * Red-failure mode: PATCH strips `updates.no_billing_changes`, so the
 * saved migration does not match the dashboard toggle.
 *
 * Green-success criteria: PATCH persists `no_billing_changes` like create.
 */

import { expect, test } from "bun:test";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

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
