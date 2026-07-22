import { beforeEach, expect, mock, test } from "bun:test";
import type { FullCustomer, PooledBalanceOp } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const fullCustomer = {
	id: "customer_1",
	internal_id: "internal_customer_1",
	customer_products: [],
	entities: [],
} as unknown as FullCustomer;

let poolRemoved = false;
let assignmentExpired = false;
let failAfterAssignmentExpiry = true;
let assignmentAttachedToValidLink = false;
let reattachBeforeLock = false;
const executedOperations: PooledBalanceOp[][] = [];
const invalidations: Array<{ customerId: string; flushBalances?: boolean }> =
	[];

mock.module(
	"@/internal/licenses/repos/customerLicenseRepo/customerTouchesLicenses.js",
	() => ({ customerTouchesLicenses: mock(async () => true) }),
);
mock.module("@/internal/customers/CusService.js", () => ({
	CusService: { getFull: mock(async () => fullCustomer) },
}));
mock.module(
	"@/internal/licenses/actions/reconcile/setupReconcileContext.js",
	() => ({
		setupReconcileContext: mock(async () => ({
			fullCustomer,
			parentCustomerProducts: [],
			customerLicenses: [],
			strandedCustomerLicenses: [],
			seatCountByCustomerLicenseId: new Map(),
		})),
	}),
);
mock.module(
	"@/internal/licenses/actions/reconcile/reconcileCustomerLicenseBalances/reconcileCustomerLicenseBalances.js",
	() => ({ reconcileCustomerLicenseBalances: mock(async () => {}) }),
);
mock.module(
	"@/internal/licenses/actions/reconcile/expireUnusedAssignments.js",
	() => ({ expireUnusedAssignments: mock(async () => {}) }),
);
mock.module("@/internal/licenses/actions/logs/logLicenseAction.js", () => ({
	logLicenseAction: mock(() => {}),
}));
mock.module("@/internal/licenses/repos/licenseAssignmentRepo.js", () => ({
	licenseAssignmentRepo: {
		listActiveOrphanAssignments: mock(async () =>
			assignmentAttachedToValidLink
				? []
				: [
						{
							id: "assignment_1",
							internal_customer_id: "internal_customer_1",
						},
					],
		),
		expireOrphanAssignments: mock(async () => {
			if (!assignmentAttachedToValidLink) assignmentExpired = true;
		}),
	},
}));
mock.module(
	"@/internal/balances/utils/sync/withCustomerBalanceSyncLock.js",
	() => ({
		withCustomerBalanceSyncLock: mock(async ({ callback }) => {
			if (reattachBeforeLock) assignmentAttachedToValidLink = true;
			return callback({ db: {} as never });
		}),
	}),
);
mock.module(
	"@/internal/billing/v2/execute/executeAutumnActions/executePooledBalanceOps.js",
	() => ({
		executePooledBalanceOps: mock(
			async ({
				pooledBalanceOps,
				beforeRebalance,
			}: {
				pooledBalanceOps: PooledBalanceOp[];
				beforeRebalance?: ({ db }: { db: never }) => Promise<void>;
			}) => {
				if (reattachBeforeLock) assignmentAttachedToValidLink = true;
				const snapshot = { poolRemoved, assignmentExpired };
				try {
					executedOperations.push(pooledBalanceOps);
					poolRemoved = true;
					await beforeRebalance?.({ db: {} as never });
					if (failAfterAssignmentExpiry) {
						failAfterAssignmentExpiry = false;
						throw new Error("synthetic pooled cutover failure");
					}
				} catch (error) {
					poolRemoved = snapshot.poolRemoved;
					assignmentExpired = snapshot.assignmentExpired;
					throw error;
				}
			},
		),
		applyPreparedPooledBalanceCacheCutover: mock(async () => {}),
	}),
);
mock.module(
	"@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js",
	() => ({
		deleteCachedFullCustomer: mock(
			async ({
				customerId,
				flushBalances,
			}: {
				customerId: string;
				flushBalances?: boolean;
			}) => invalidations.push({ customerId, flushBalances }),
		),
	}),
);

const { reconcileLicenseStateForCustomer } = await import(
	// @ts-expect-error - Bun test cache-busting import isolates module mocks.
	"@/internal/licenses/actions/reconcile/reconcileLicenseState.js?pooledLicenseEndTransaction"
);

beforeEach(() => {
	poolRemoved = false;
	assignmentExpired = false;
	failAfterAssignmentExpiry = true;
	assignmentAttachedToValidLink = false;
	reattachBeforeLock = false;
	executedOperations.length = 0;
	invalidations.length = 0;
});

test("orphan source removal and assignment expiry roll back together and flush on failure", async () => {
	const executeTransition = () =>
		reconcileLicenseStateForCustomer({
			ctx: {} as AutumnContext,
			idOrInternalId: fullCustomer.id ?? fullCustomer.internal_id,
		});

	await expect(executeTransition()).rejects.toThrow(
		"synthetic pooled cutover failure",
	);
	expect({ poolRemoved, assignmentExpired }).toEqual({
		poolRemoved: false,
		assignmentExpired: false,
	});
	expect(invalidations).toEqual([
		{
			customerId: fullCustomer.id ?? fullCustomer.internal_id,
			flushBalances: true,
		},
	]);

	await executeTransition();
	expect({ poolRemoved, assignmentExpired }).toEqual({
		poolRemoved: true,
		assignmentExpired: true,
	});
	expect(executedOperations).toEqual([
		[
			{
				op: "remove_source",
				internalCustomerId: fullCustomer.internal_id,
				sourceCustomerProductId: "assignment_1",
				effectiveAt: null,
			},
		],
		[
			{
				op: "remove_source",
				internalCustomerId: fullCustomer.internal_id,
				sourceCustomerProductId: "assignment_1",
				effectiveAt: null,
			},
		],
	]);
});

test("orphan candidates are re-read after acquiring the balance lock", async () => {
	reattachBeforeLock = true;
	failAfterAssignmentExpiry = false;

	await reconcileLicenseStateForCustomer({
		ctx: {} as AutumnContext,
		idOrInternalId: fullCustomer.id ?? fullCustomer.internal_id,
	});

	expect(executedOperations).toEqual([]);
	expect({ poolRemoved, assignmentExpired }).toEqual({
		poolRemoved: false,
		assignmentExpired: false,
	});
});
