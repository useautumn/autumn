/**
 * TDD contract for wiring customer get-or-create overload failures to recovery.
 *
 * Contract under test:
 * - A transient FullSubject failure is still returned as the existing overload 503.
 * - The validated request is captured once with the execution stage at failure.
 * - Recovery workers can explicitly disable capture to prevent recursive enqueue.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiVersion, ApiVersionClass, AppEnv } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const transientError = Object.assign(new Error("connect timeout"), {
	code: "CONNECT_TIMEOUT",
});

const mockState = {
	queueCalls: [] as Record<string, unknown>[],
};

// Real modules captured BEFORE mocking so afterAll can restore them — module
// mocks leak across test files (mock.restore does not undo them).
const MOCKED_MODULE_PATHS = [
	"@/internal/misc/rollouts/fullSubjectRolloutUtils.js",
	"@/internal/customers/cache/fullSubject/index.js",
	"@/internal/customers/recovery/queueFailedCustomerCreation.js",
	"@/internal/customers/actions/ensureStripeCustomerFromCustomerData.js",
	"@/internal/customers/cusUtils/apiCusUtils/getApiCustomer.js",
	"@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrCreateCachedFullCustomer.js",
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

mock.module("@/internal/misc/rollouts/fullSubjectRolloutUtils.js", () => ({
	isFullSubjectRolloutEnabled: () => true,
}));

mock.module("@/internal/customers/cache/fullSubject/index.js", () => ({
	getOrCreateCachedFullSubject: async () => {
		throw transientError;
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

mock.module(
	"@/internal/customers/actions/ensureStripeCustomerFromCustomerData.js",
	() => ({
		ensureStripeCustomerFromCustomerData: async () => {},
	}),
);

mock.module(
	"@/internal/customers/cusUtils/apiCusUtils/getApiCustomer.js",
	() => ({
		getApiCustomer: () => ({ id: "legacy" }),
	}),
);

mock.module(
	"@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrCreateCachedFullCustomer.js",
	() => ({
		getOrCreateCachedFullCustomer: async () => ({ id: "legacy" }),
	}),
);

mock.module("@/internal/customers/cusUtils/getApiCustomerV2/index.js", () => ({
	getApiCustomerV2: () => ({ id: "v2" }),
}));

const { getOrCreateApiCustomerByRollout } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/customers/actions/getOrCreateApiCustomerByRollout.js?customerCreationCapture"
);

const buildContext = () =>
	({
		id: "req_customer_123",
		org: { id: "org_123" },
		env: AppEnv.Live,
		apiVersion: new ApiVersionClass(ApiVersion.V2_1),
		extraLogs: {},
		logger: {
			warn: mock(() => {}),
			error: mock(() => {}),
		},
	}) as unknown as AutumnContext;

const params = {
	customer_id: "customer_123",
	customer_data: { email: "customer@example.com" },
};

describe("getOrCreateApiCustomerByRollout recovery capture", () => {
	beforeEach(() => {
		mockState.queueCalls = [];
	});

	test("captures the validated request while preserving overload response semantics", async () => {
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
			data: { reason: "critical_db_saturated" },
		});

		expect(mockState.queueCalls).toEqual([
			expect.objectContaining({
				ctx,
				params,
				source: "handleGetOrCreateCustomerV2",
				withAutumnId: true,
				failureStage: "lookup",
			}),
		]);
	});

	test("does not recursively capture a recovery replay", async () => {
		const ctx = buildContext();

		await expect(
			getOrCreateApiCustomerByRollout({
				ctx,
				params,
				source: "customerCreationRecovery",
				enqueueRecoveryOnTransientFailure: false,
			}),
		).rejects.toMatchObject({ statusCode: 503 });

		expect(mockState.queueCalls).toHaveLength(0);
	});
});
