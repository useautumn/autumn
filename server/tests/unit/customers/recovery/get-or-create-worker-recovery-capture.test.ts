/**
 * TDD contract for wiring the balance worker's get-or-create failures to recovery.
 *
 * Contract under test:
 * - A worker fail-open error (unreachable, deadline, stale route, no verdict) is captured
 *   with the stage the create reached, and still surfaces as the worker's own 503.
 * - A transient Postgres error under the worker path is captured and shed as the usual 503.
 * - A 4xx verdict is never captured.
 * - Recovery replays can disable capture to prevent recursive enqueue.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { BalanceWorkerClientError } from "@autumn/balance-worker-client";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { rethrowBalanceWorkerError } from "@/internal/balances/balanceWorker/balanceWorkerErrors.js";
import { setCustomerCreationRecoveryStage } from "@/internal/customers/recovery/customerCreationRecoveryStage.js";

const mockState = {
	queueCalls: [] as Record<string, unknown>[],
	createFailure: undefined as unknown,
};

const MOCKED_MODULE_PATHS = [
	"@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js",
	"@/internal/balanceWorker/subject/withCreateIfMissing.js",
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
	() => ({
		isBalanceWorkerRolloutEnabled: () => true,
	}),
);

// The create reached its plan write before failing, as a real worker outage leaves it.
mock.module("@/internal/balanceWorker/subject/withCreateIfMissing.js", () => ({
	withCreateIfMissing: async ({ ctx }: { ctx: AutumnContext }) => {
		setCustomerCreationRecoveryStage({ ctx, stage: "pre_commit" });
		throw mockState.createFailure;
	},
}));

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
	getApiCustomerV2: () => ({ id: "v2" }),
}));

const { getOrCreateApiCustomerByRollout } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/customers/actions/getOrCreateApiCustomerByRollout.js?workerCreationCapture"
);

const buildContext = () =>
	({
		id: "req_customer_123",
		org: { id: "org_123", config: {} },
		env: AppEnv.Live,
		apiVersion: new ApiVersionClass(ApiVersion.V2_1),
		extraLogs: {},
		state: {},
		logger: {
			warn: mock(() => {}),
			error: mock(() => {}),
		},
	}) as unknown as AutumnContext;

const params = {
	customer_id: "customer_123",
	customer_data: { email: "customer@example.com", create_in_stripe: true },
};

/** The 503 the server raises when the client gave up before any worker answered. */
const workerUnavailableError = (): unknown => {
	try {
		rethrowBalanceWorkerError({
			cause: new BalanceWorkerClientError({
				code: "TRANSPORT",
				outcome: "not_submitted",
				message: "Worker request failed",
			}),
		});
	} catch (error) {
		return error;
	}
};

const transientDbError = Object.assign(new Error("connect timeout"), {
	code: "CONNECT_TIMEOUT",
});

const invalidInputsError = new RecaseError({
	message: "Entity with id entity_123 not found",
	code: ErrCode.InvalidInputs,
	statusCode: 400,
});

describe("getOrCreateApiCustomerByRollout worker recovery capture", () => {
	beforeEach(() => {
		mockState.queueCalls = [];
	});

	test("captures a worker fail-open failure with its stage and keeps the worker's 503", async () => {
		mockState.createFailure = workerUnavailableError();
		const ctx = buildContext();

		await expect(
			getOrCreateApiCustomerByRollout({
				ctx,
				params,
				source: "handleGetOrCreateCustomerV2",
				withAutumnId: true,
			}),
		).rejects.toMatchObject({
			statusCode: 503,
			code: "balance_worker_unavailable",
		});

		expect(mockState.queueCalls).toEqual([
			expect.objectContaining({
				ctx,
				params,
				source: "handleGetOrCreateCustomerV2",
				withAutumnId: true,
				failureStage: "pre_commit",
			}),
		]);
	});

	test("captures a transient Postgres failure under the worker path and sheds it", async () => {
		mockState.createFailure = transientDbError;
		const ctx = buildContext();

		await expect(
			getOrCreateApiCustomerByRollout({ ctx, params }),
		).rejects.toMatchObject({
			statusCode: 503,
			data: { reason: "critical_db_saturated" },
		});

		expect(mockState.queueCalls).toEqual([
			expect.objectContaining({ params, failureStage: "pre_commit" }),
		]);
	});

	test("never captures a 4xx verdict", async () => {
		mockState.createFailure = invalidInputsError;

		await expect(
			getOrCreateApiCustomerByRollout({ ctx: buildContext(), params }),
		).rejects.toMatchObject({ statusCode: 400 });

		expect(mockState.queueCalls).toHaveLength(0);
	});

	test("does not recursively capture a recovery replay", async () => {
		mockState.createFailure = workerUnavailableError();

		await expect(
			getOrCreateApiCustomerByRollout({
				ctx: buildContext(),
				params,
				source: "customerCreationRecovery",
				enqueueRecoveryOnTransientFailure: false,
			}),
		).rejects.toMatchObject({ statusCode: 503 });

		expect(mockState.queueCalls).toHaveLength(0);
	});
});
