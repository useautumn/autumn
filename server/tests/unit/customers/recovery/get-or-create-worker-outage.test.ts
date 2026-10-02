/**
 * A real worker outage during get_or_create on the worker path is captured for recovery.
 *
 * The read fails open: `readBalanceWorkerSubject` answers from Postgres when the worker is
 * unreachable, and a missing customer there is what starts the create. The create's own worker
 * write cannot fail open, and that is the error `shed503OnTransientError` captures.
 *
 * Contract under test:
 * - Worker read unreachable + customer absent in Postgres → create runs → its worker write's
 *   fail-open 503 is captured at the stage the create reached and surfaces unchanged.
 * - Worker read unreachable + customer present in Postgres → served from Postgres, nothing captured.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import {
	ApiVersion,
	ApiVersionClass,
	CustomerNotFoundError,
	type FullSubject,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { rethrowBalanceWorkerError } from "@/internal/balances/balanceWorker/balanceWorkerErrors.js";
import { setCustomerCreationRecoveryStage } from "@/internal/customers/recovery/customerCreationRecoveryStage.js";

const mockState = {
	queueCalls: [] as Record<string, unknown>[],
	postgresHasCustomer: false,
	createCalls: 0,
};

const postgresSubject = {
	customer: { id: "customer_123", internal_id: "cus_from_postgres" },
} as unknown as FullSubject;

const MOCKED_MODULE_PATHS = [
	"@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js",
	"@/external/balanceWorker/getBalanceWorkerClient.js",
	"@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js",
	"@/internal/customers/actions/createWithDefaults/createCustomerWithDefaults.js",
	"@/internal/customers/recovery/queueFailedCustomerCreation.js",
	"@/internal/customers/cusUtils/getApiCustomerV2/index.js",
] as const;
const realModules = new Map<string, Record<string, unknown>>();
for (const path of MOCKED_MODULE_PATHS) {
	realModules.set(path, { ...(await import(path)) });
}
afterAll(() => {
	for (const [path, realModule] of realModules) {
		mock.module(path, () => realModule);
	}
});

mock.module(
	"@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js",
	() => ({ isBalanceWorkerRolloutEnabled: () => true }),
);

// The real read path, over a client whose every send finds no owner.
mock.module("@/external/balanceWorker/getBalanceWorkerClient.js", () => ({
	getBalanceWorkerClient: () => ({
		readSubjectState: async () => {
			throw new BalanceWorkerClientError({
				code: "NO_OWNER",
				outcome: "not_submitted",
				message: "No worker owns the command partition",
			});
		},
	}),
}));

mock.module(
	"@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js",
	() => ({
		getOrSetCachedFullSubject: async () => {
			if (mockState.postgresHasCustomer) return postgresSubject;
			throw new CustomerNotFoundError({ customerId: "customer_123" });
		},
	}),
);

// The create's worker write: `applyBillingPlanOnWorker` rethrows the client error as the fail-open 503.
mock.module(
	"@/internal/customers/actions/createWithDefaults/createCustomerWithDefaults.js",
	() => ({
		createCustomerWithDefaults: async ({ ctx }: { ctx: AutumnContext }) => {
			mockState.createCalls += 1;
			setCustomerCreationRecoveryStage({ ctx, stage: "pre_commit" });
			rethrowBalanceWorkerError({
				cause: new BalanceWorkerClientError({
					code: "NO_OWNER",
					outcome: "not_submitted",
					message: "No worker owns the command partition",
				}),
			});
		},
	}),
);

mock.module(
	"@/internal/customers/recovery/queueFailedCustomerCreation.js",
	() => ({
		queueFailedCustomerCreation: async (args: Record<string, unknown>) => {
			mockState.queueCalls.push(args);
			return true;
		},
	}),
);

mock.module("@/internal/customers/cusUtils/getApiCustomerV2/index.js", () => ({
	getApiCustomerV2: ({ fullSubject }: { fullSubject: FullSubject }) => ({
		id: fullSubject.customer.id,
	}),
}));

const { getOrCreateApiCustomerByRollout } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/customers/actions/getOrCreateApiCustomerByRollout.js?workerOutageCapture"
);

const buildContext = () =>
	({
		...contexts.create({}),
		id: "req_customer_123",
		timestamp: 1_700_000_000_000,
		apiVersion: new ApiVersionClass(ApiVersion.V2_1),
		extraLogs: {},
		state: {},
	}) as unknown as AutumnContext;

const params = {
	customer_id: "customer_123",
	customer_data: { email: "customer@example.com", create_in_stripe: true },
};

describe("getOrCreateApiCustomerByRollout during a worker outage", () => {
	beforeEach(() => {
		mockState.queueCalls = [];
		mockState.createCalls = 0;
		mockState.postgresHasCustomer = false;
	});

	test("a missing customer's create fails on the worker write and is captured", async () => {
		const ctx = buildContext();

		await expect(
			getOrCreateApiCustomerByRollout({
				ctx,
				params,
				source: "handleGetOrCreateCustomerV2",
			}),
		).rejects.toMatchObject({
			statusCode: 503,
			code: "balance_worker_unavailable",
		});

		expect(ctx.extraLogs.balanceWorkerFailOpen).toBe("read");
		expect(mockState.createCalls).toBe(1);
		expect(mockState.queueCalls).toEqual([
			expect.objectContaining({ params, failureStage: "pre_commit" }),
		]);
	});

	test("an existing customer is served from Postgres and nothing is captured", async () => {
		mockState.postgresHasCustomer = true;

		const customer = await getOrCreateApiCustomerByRollout({
			ctx: buildContext(),
			params: { customer_id: "customer_123" },
		});

		expect(customer).toEqual({ id: "customer_123" });
		expect(mockState.createCalls).toBe(0);
		expect(mockState.queueCalls).toHaveLength(0);
	});
});
