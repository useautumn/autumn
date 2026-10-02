/**
 * TDD contract for wiring entities.create failures to recovery.
 *
 * Contract under test:
 * - A worker fail-open failure is captured with the validated create params and still
 *   surfaces as the worker's own 503.
 * - A transient Postgres failure is captured and shed as the usual 503.
 * - A 4xx verdict is never captured.
 * - Recovery replays can disable capture to prevent recursive enqueue.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
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
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const mockState = {
	queueCalls: [] as Record<string, unknown>[],
	createFailure: undefined as unknown,
};

await mockModuleWithRestore(
	"@/external/redis/utils/lockUtils/withLock.js",
	() => ({
		withLock: ({ fn }: { fn: () => Promise<unknown> }) => fn(),
	}),
);
await mockModuleWithRestore(
	"@/internal/entities/actions/createEntitiesV2/createEntitiesV2.js",
	() => ({
		createEntitiesV2: async () => {
			throw mockState.createFailure;
		},
	}),
);
await mockModuleWithRestore(
	"@/internal/entities/recovery/queueFailedEntityCreation.js",
	() => ({
		queueFailedEntityCreation: async (args: Record<string, unknown>) => {
			mockState.queueCalls.push(args);
			return true;
		},
	}),
);

const { batchCreateEntities } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/entities/actions/batchCreateEntities.js?entityCreationCapture"
);

const buildContext = () =>
	({
		id: "req_entity_123",
		org: { id: "org_123", config: {} },
		env: AppEnv.Live,
		apiVersion: new ApiVersionClass(ApiVersion.V2_1),
		extraLogs: {},
		logger: {
			warn: mock(() => {}),
			error: mock(() => {}),
		},
	}) as unknown as AutumnContext;

const params = {
	customerId: "customer_123",
	customerData: { email: "customer@example.com" },
	createEntityData: [{ id: "entity_123", name: null, feature_id: "seats" }],
	withAutumnId: true,
};

/** The 503 the server raises when the client gave up before any worker answered. */
const workerUnavailableError = (): unknown => {
	try {
		rethrowBalanceWorkerError({
			cause: new BalanceWorkerClientError({
				code: "DEADLINE",
				outcome: "not_submitted",
				message: "Worker request deadline exceeded",
			}),
		});
	} catch (error) {
		return error;
	}
};

const transientDbError = Object.assign(new Error("connect timeout"), {
	code: "CONNECT_TIMEOUT",
});

const featureLimitError = new RecaseError({
	message: "Cannot create 1 entities for feature seats",
	code: ErrCode.FeatureLimitReached,
	statusCode: 400,
});

describe("batchCreateEntities recovery capture", () => {
	beforeEach(() => {
		mockState.queueCalls = [];
	});

	test("captures a worker fail-open failure and keeps the worker's 503", async () => {
		mockState.createFailure = workerUnavailableError();
		const ctx = buildContext();

		await expect(batchCreateEntities({ ctx, ...params })).rejects.toMatchObject(
			{ statusCode: 503, code: "balance_worker_unavailable" },
		);

		expect(mockState.queueCalls).toEqual([
			expect.objectContaining({ ctx, params }),
		]);
	});

	test("captures a transient Postgres failure and sheds it", async () => {
		mockState.createFailure = transientDbError;

		await expect(
			batchCreateEntities({ ctx: buildContext(), ...params }),
		).rejects.toMatchObject({
			statusCode: 503,
			data: { reason: "critical_db_saturated" },
		});

		expect(mockState.queueCalls).toEqual([expect.objectContaining({ params })]);
	});

	test("never captures a 4xx verdict", async () => {
		mockState.createFailure = featureLimitError;

		await expect(
			batchCreateEntities({ ctx: buildContext(), ...params }),
		).rejects.toMatchObject({ statusCode: 400 });

		expect(mockState.queueCalls).toHaveLength(0);
	});

	test("does not recursively capture a recovery replay", async () => {
		mockState.createFailure = workerUnavailableError();

		await expect(
			batchCreateEntities({
				ctx: buildContext(),
				...params,
				enqueueRecoveryOnTransientFailure: false,
			}),
		).rejects.toMatchObject({ statusCode: 503 });

		expect(mockState.queueCalls).toHaveLength(0);
	});
});
