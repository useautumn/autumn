/**
 * Customer deletion helpers must remove synthetic pooled graphs before their customer rows.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";

const deleteGraphsByInternalCustomerIds = mock(async () => {});

mock.module(
	"@/internal/billing/v2/pooledBalances/repos/pooledBalanceRepo.js",
	() => ({
		pooledBalanceRepo: { deleteGraphsByInternalCustomerIds },
	}),
);

const { CusService } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/customers/CusService.js?pooledCustomerDeletionCleanup"
);

const buildDatabase = ({
	batches,
}: {
	batches: Array<Array<{ internalId: string }>>;
}) => {
	const remainingBatches = [...batches];
	const deletedRows = batches.flat();
	const transactionDatabase = {
		select: mock(() => ({
			from: () => ({
				where: () => {
					const batch = remainingBatches.shift() ?? [];
					type Query = Promise<typeof batch> & {
						limit: () => Query;
						for: () => Query;
					};
					const query = Promise.resolve(batch) as Query;
					query.limit = () => query;
					query.for = () => query;
					return query;
				},
			}),
		})),
		delete: mock(() => ({
			where: () => ({
				returning: async () => deletedRows,
			}),
		})),
	};
	const db = {
		...transactionDatabase,
		transaction: mock(
			async <T>(
				callback: (transaction: typeof transactionDatabase) => Promise<T>,
			) => callback(transactionDatabase),
		),
	};

	return db as unknown as DrizzleCli;
};

describe("pooled graph customer deletion cleanup", () => {
	beforeEach(() => {
		deleteGraphsByInternalCustomerIds.mockClear();
	});

	test("direct deletion cleans the customer's synthetic pooled graph first", async () => {
		const db = buildDatabase({ batches: [[{ internalId: "customer_a" }]] });

		await CusService.deleteByInternalId({
			db,
			internalId: "customer_a",
			orgId: "org_a",
			env: AppEnv.Sandbox,
		});

		expect(deleteGraphsByInternalCustomerIds).toHaveBeenCalledWith({
			db: expect.anything(),
			internalCustomerIds: ["customer_a"],
		});
	});

	test("bulk deletion cleans every matching customer's synthetic pooled graph", async () => {
		const db = buildDatabase({
			batches: [[{ internalId: "customer_a" }, { internalId: "customer_b" }]],
		});

		await CusService.deleteByOrgId({
			db,
			orgId: "org_a",
			env: AppEnv.Sandbox,
		});

		expect(deleteGraphsByInternalCustomerIds).toHaveBeenCalledWith({
			db: expect.anything(),
			internalCustomerIds: ["customer_a", "customer_b"],
		});
	});

	test("safe bulk deletion cleans each batch before deleting it", async () => {
		const db = buildDatabase({
			batches: [
				[{ internalId: "customer_a" }, { internalId: "customer_b" }],
				[],
			],
		});

		await CusService.safeDeleteByOrgId({
			db,
			orgId: "org_a",
			env: AppEnv.Sandbox,
			batchSize: 2,
		});

		expect(deleteGraphsByInternalCustomerIds).toHaveBeenCalledTimes(1);
		expect(deleteGraphsByInternalCustomerIds).toHaveBeenCalledWith({
			db: expect.anything(),
			internalCustomerIds: ["customer_a", "customer_b"],
		});
	});
});
