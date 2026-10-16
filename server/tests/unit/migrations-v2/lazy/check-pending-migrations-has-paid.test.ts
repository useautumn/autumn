/**
 * S2b contract: the lazy path answers `customer.has_paid` from invoices.
 *
 *   - A pending `has_paid: false` migration enqueues a never-paid customer and
 *     skips one that has paid.
 *   - `hasPaid` is loaded at most once per call, however many filters use it.
 *   - It is not loaded at all when no pending filter uses `has_paid`.
 *
 * Lazy runs are kill-switched in prod (`LAZY_MIGRATION_RUNS_DISABLED`), so
 * the switch is mocked off here to exercise the matching path.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import type { CustomerFilter } from "@autumn/shared/api/migrations/filters/customerFilter.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore";

let invoiceLoads = 0;
let customerHasPaid = false;
const triggeredMigrationIds: string[] = [];

await mockModuleWithRestore(
	"@/internal/migrations/v2/run/utils/migrationRunConstants.js",
	() => ({ LAZY_MIGRATION_RUNS_DISABLED: false }),
);
await mockModuleWithRestore(
	"@/internal/migrations/v2/utils/shouldRunMigrationInline.js",
	() => ({ shouldRunMigrationInline: () => false }),
);
await mockModuleWithRestore(
	"@/trigger/migrations/runMigrationCustomerTask/runMigrationCustomerTask.js",
	() => ({
		runMigrationCustomerTask: {
			trigger: async ({
				migrationInternalId,
			}: {
				migrationInternalId: string;
			}) => {
				triggeredMigrationIds.push(migrationInternalId);
			},
		},
	}),
);
await mockModuleWithRestore("@/internal/invoices/repos/invoiceRepo.js", () => ({
	invoiceRepo: {
		customerHasPaidInvoice: async () => {
			invoiceLoads++;
			return customerHasPaid;
		},
	},
}));

const { checkPendingMigrationsForCustomer } = await import(
	"@/internal/migrations/v2/lazy/checkPendingMigrationsForCustomer.js"
);

const runCheck = async ({ filters }: { filters: CustomerFilter[] }) => {
	const ctx = {
		org: {
			id: "org_test",
			pendingMigrations: filters.map((customer, index) => ({
				internal_id: `run_${index}`,
				migration: { internal_id: `mig_${index}`, filter: { customer } },
			})),
		},
		env: "sandbox",
		insideTriggerTask: false,
	};
	await checkPendingMigrationsForCustomer({
		ctx: ctx as never,
		fullCustomer: {
			id: "cus_test",
			internal_id: "cus_internal_test",
			customer_products: [],
			migration_item_runs: [],
		},
	});
};

describe("checkPendingMigrationsForCustomer: customer.has_paid", () => {
	beforeEach(() => {
		invoiceLoads = 0;
		triggeredMigrationIds.length = 0;
	});

	test("has_paid: false enqueues a never-paid customer, loading invoices once", async () => {
		customerHasPaid = false;
		await runCheck({
			filters: [{ has_paid: false }, { $or: [{ has_paid: false }] }],
		});

		expect(triggeredMigrationIds).toEqual(["mig_0", "mig_1"]);
		expect(invoiceLoads).toBe(1);
	});

	test("has_paid: false skips a customer that has paid", async () => {
		customerHasPaid = true;
		await runCheck({ filters: [{ has_paid: false }] });

		expect(triggeredMigrationIds).toEqual([]);
		expect(invoiceLoads).toBe(1);
	});

	test("filters without has_paid never load invoices", async () => {
		await runCheck({ filters: [{}, { customer_id: "cus_test" }] });

		expect(triggeredMigrationIds).toEqual(["mig_0", "mig_1"]);
		expect(invoiceLoads).toBe(0);
	});
});
