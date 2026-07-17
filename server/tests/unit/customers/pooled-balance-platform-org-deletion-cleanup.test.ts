/**
 * Platform sub-org teardown must use pooled-aware customer cleanup before deleting the org.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Organization } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";

const deleteByOrgId = mock(async () => []);
const deleteGraphsByOrgId = mock(async () => {});

mock.module("@/internal/customers/CusService.js", () => ({
	CusService: { deleteByOrgId },
}));
mock.module(
	"@/internal/billing/v2/pooledBalances/repos/pooledBalanceRepo.js",
	() => ({ pooledBalanceRepo: { deleteGraphsByOrgId } }),
);
mock.module("@/internal/orgs/orgUtils/deleteOrgUtils.js", () => ({
	deleteStripeAccounts: mock(async () => {}),
	deleteStripeWebhooks: mock(async () => {}),
	deleteSvixWebhooks: mock(async () => {}),
}));

const { deletePlatformSubOrg } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/orgs/deleteOrg/deletePlatformSubOrg.js?pooledCustomerDeletionCleanup"
);

const org = { id: "org_a", slug: "org-a" } as Organization;
const logger = {
	info: mock(() => {}),
} as unknown as Logger;

const buildDatabase = ({ hasLiveCustomer }: { hasLiveCustomer: boolean }) => {
	const transactionDatabase = {
		delete: mock(() => ({ where: async () => {} })),
	};
	return {
		query: {
			customers: {
				findFirst: mock(async () =>
					hasLiveCustomer ? { internal_id: "customer_live" } : undefined,
				),
			},
		},
		transaction: mock(
			async <T>(
				callback: (transaction: typeof transactionDatabase) => Promise<T>,
			) => callback(transactionDatabase),
		),
	} as unknown as DrizzleCli;
};

describe("platform pooled graph deletion cleanup", () => {
	beforeEach(() => {
		deleteByOrgId.mockClear();
		deleteGraphsByOrgId.mockClear();
	});

	test("normal teardown routes sandbox customers through pooled-aware bulk deletion", async () => {
		const db = buildDatabase({ hasLiveCustomer: false });

		await deletePlatformSubOrg({ db, org, logger });

		expect(deleteByOrgId).toHaveBeenCalledWith({
			db,
			orgId: org.id,
			env: "sandbox",
		});
		expect(deleteGraphsByOrgId).not.toHaveBeenCalled();
	});

	test("forced test teardown also cleans graphs for live rows deleted by org cascade", async () => {
		const db = buildDatabase({ hasLiveCustomer: true });

		await deletePlatformSubOrg({
			db,
			org,
			logger,
			skipLiveCustomerCheck: true,
		});

		expect(deleteByOrgId).toHaveBeenCalledTimes(1);
		expect(deleteGraphsByOrgId).toHaveBeenCalledWith({
			db: expect.anything(),
			orgId: org.id,
		});
	});
});
