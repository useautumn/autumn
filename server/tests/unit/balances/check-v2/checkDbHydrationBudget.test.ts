import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";

const mockState = {
	hydrationMode: "resolve" as "resolve" | "hang",
	hydrationCalls: 0,
};

const buildFullSubject = () => ({
	customer: { id: "cus_123", internal_id: "internal_123" },
	customer_products: [],
	extra_customer_entitlements: [],
	pooled_customer_entitlements: [],
	subscriptions: [],
	invoices: [],
	migration_item_runs: [],
	entity: undefined,
});

mock.module("@/internal/customers/repos/getFullSubject/index.js", () => ({
	getFullSubject: async () => null,
	getFullSubjectQuery: () => null,
	resultToFullSubject: () => null,
	subjectQueryRowToNormalized: () => null,
	getFullSubjectNormalized: async () => {
		mockState.hydrationCalls += 1;
		if (mockState.hydrationMode === "hang") {
			return await new Promise<never>(() => {});
		}
		return { normalized: {} as never, fullSubject: buildFullSubject() };
	},
}));

mock.module(
	"@/internal/customers/cusUtils/getApiCustomerV2/getApiSubject.js",
	() => ({
		getApiSubject: async () => ({ balances: {}, flags: {} }),
	}),
);

mock.module("@/internal/balances/check/buildEvaluationSubject.js", () => ({
	buildEvaluationSubject: async () => ({ balances: {}, flags: {} }),
}));

mock.module("@/internal/balances/autoTopUp/triggerAutoTopUp.js", () => ({
	triggerAutoTopUp: async () => {
		// no-op
	},
}));

import { FeatureType } from "@autumn/shared";
import { isTransientDbError } from "@/db/dbUtils.js";
import {
	CHECK_DB_HYDRATION_BUDGET_MS,
	getCheckDataV2,
} from "@/internal/balances/check/getCheckDataV2.js";
import { getOrSetCachedPartialFullSubject } from "@/internal/customers/cache/fullSubject/actions/partial/getOrSetCachedPartialFullSubject.js";

// skipCache: true routes the shared getter straight to the (mocked) DB hydration.
const buildCtx = () =>
	({
		skipCache: true,
		apiVersion: { gte: () => true },
		features: [{ id: "messages", type: FeatureType.Metered }],
		logger: {
			debug: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
		},
	}) as never;

const resetMockState = () => {
	mockState.hydrationMode = "resolve";
	mockState.hydrationCalls = 0;
};

beforeEach(resetMockState);
afterEach(resetMockState);

describe("check DB hydration budget", () => {
	test("returns check data when hydration resolves within budget", async () => {
		const checkData = await getCheckDataV2({
			ctx: buildCtx(),
			body: { customer_id: "cus_123", feature_id: "messages" } as never,
			requiredBalance: 1,
		});

		expect(mockState.hydrationCalls).toBe(1);
		expect(checkData.customerId).toBe("cus_123");
		expect(checkData.featureToUse.id).toBe("messages");
		expect(checkData.fullSubject.customer.id).toBe("cus_123");
	});

	test("hydration hanging past budget throws an error the fail-open predicate classifies as transient", async () => {
		mockState.hydrationMode = "hang";
		const startedAt = Date.now();

		let thrown: unknown;
		try {
			await getCheckDataV2({
				ctx: buildCtx(),
				body: { customer_id: "cus_123", feature_id: "messages" } as never,
				requiredBalance: 1,
			});
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(Error);
		expect((thrown as Error).message).toBe("Query read timeout");
		expect(isTransientDbError({ error: thrown })).toBe(true);
		expect(Date.now() - startedAt).toBeGreaterThanOrEqual(
			CHECK_DB_HYDRATION_BUDGET_MS - 100,
		);
	});

	test("shared subject getter keeps waiting past check's budget (no timeout outside check)", async () => {
		mockState.hydrationMode = "hang";

		const outcome = await Promise.race([
			getOrSetCachedPartialFullSubject({
				ctx: buildCtx(),
				customerId: "cus_123",
				featureIds: ["messages"],
				source: "unit-test",
			}).then(
				() => "settled",
				() => "settled",
			),
			new Promise<string>((resolve) => {
				setTimeout(
					() => resolve("still-pending"),
					CHECK_DB_HYDRATION_BUDGET_MS + 500,
				);
			}),
		]);

		expect(outcome).toBe("still-pending");
	});
});

afterAll(() => {
	mock.restore();
});
