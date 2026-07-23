/**
 * TDD contract for customer creation recovery replay.
 *
 * Contract under test:
 * - Safe failures replay the original normalized get-or-create operation.
 * - Replays preserve the original API version and cannot enqueue themselves again.
 * - Replays log whether they created or fetched the customer.
 * - Failures after the Autumn commit stop for manual billing review.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiVersion, ApiVersionClass, AppEnv } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { CustomerCreationRecoveryPayload } from "@/internal/customers/recovery/customerCreationRecoveryTypes.js";

const mockState = {
	getOrCreateCalls: [] as Record<string, unknown>[],
	outcome: "created" as "created" | "existing" | undefined,
};

mock.module(
	"@/internal/customers/actions/getOrCreateApiCustomerByRollout.js",
	() => ({
		getOrCreateApiCustomerByRollout: async (
			args: Record<string, unknown> & { ctx: AutumnContext },
		) => {
			mockState.getOrCreateCalls.push(args);
			if (mockState.outcome) {
				args.ctx.extraLogs.autumnPlanResult = mockState.outcome;
			}
			return { id: "customer_123" };
		},
	}),
);

const { replayFailedCustomerCreation } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/customers/recovery/replayFailedCustomerCreation.js?customerCreationRecovery"
);

const buildContext = () =>
	({
		org: { id: "org_123" },
		env: AppEnv.Live,
		apiVersion: new ApiVersionClass(ApiVersion.V0_2),
		extraLogs: {},
		logger: {
			info: mock(() => {}),
			error: mock(() => {}),
		},
	}) as unknown as AutumnContext;

const buildPayload = (
	failureStage: CustomerCreationRecoveryPayload["failureStage"] = "lookup",
): CustomerCreationRecoveryPayload => ({
	orgId: "org_123",
	env: AppEnv.Live,
	customerId: "customer_123",
	requestId: "req_customer_123",
	apiVersion: ApiVersion.V2_1,
	params: {
		customer_id: "customer_123",
		customer_data: { email: "customer@example.com" },
	},
	source: "handleGetOrCreateCustomerV2",
	withAutumnId: true,
	failureStage,
	failedAt: 1_785_000_000_000,
});

describe("replayFailedCustomerCreation", () => {
	beforeEach(() => {
		mockState.getOrCreateCalls = [];
		mockState.outcome = "created";
	});

	test("replays a safe request with its original API semantics", async () => {
		const ctx = buildContext();
		const payload = buildPayload();

		await replayFailedCustomerCreation({ ctx, payload });

		expect(ctx.apiVersion.value).toBe(ApiVersion.V2_1);
		expect(mockState.getOrCreateCalls).toEqual([
			expect.objectContaining({
				ctx,
				params: payload.params,
				source: "customerCreationRecovery",
				withAutumnId: true,
				enqueueRecoveryOnTransientFailure: false,
			}),
		]);
		expect(ctx.extraLogs.customerCreationRecoveryReplay).toMatchObject({
			outcome: "created",
			sourceRequestId: "req_customer_123",
		});
	});

	test("records a fetch when replay finds an existing customer", async () => {
		mockState.outcome = undefined;
		const ctx = buildContext();

		await replayFailedCustomerCreation({
			ctx,
			payload: buildPayload("completed"),
		});

		expect(ctx.extraLogs.customerCreationRecoveryReplay).toMatchObject({
			outcome: "fetched",
		});
	});

	test("refuses automatic replay after the Autumn transaction committed", async () => {
		const ctx = buildContext();

		await expect(
			replayFailedCustomerCreation({
				ctx,
				payload: buildPayload("autumn_committed"),
			}),
		).rejects.toThrow("requires manual billing review");

		expect(mockState.getOrCreateCalls).toHaveLength(0);
	});
});
