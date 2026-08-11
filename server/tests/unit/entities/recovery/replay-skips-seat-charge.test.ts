/**
 * TDD contract for what a replay is allowed to bill.
 *
 * Contract under test:
 * - A replay never invokes the allowance adjustment, because the shed request
 *   may already have invoiced the proration and nothing can detect that after
 *   the fact.
 * - It still decrements the seat balance, so skipping the invoice does not also
 *   leave the customer's remaining allowance overstated.
 * - A normal create is unaffected and bills as before.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const mockState = {
	adjustAllowanceCalls: [] as Record<string, unknown>[],
	decrementCalls: [] as Record<string, unknown>[],
};

// Real modules captured BEFORE mocking so afterAll can restore them — module
// mocks leak across test files (mock.restore does not undo them).
const MOCKED_MODULE_PATHS = [
	"@/external/redis/utils/lockUtils/acquireLock.js",
	"@/external/redis/utils/lockUtils/clearLock.js",
	"@/internal/balances/utils/paidAllocatedFeature/adjustAllowance.js",
	"@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js",
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

mock.module("@/external/redis/utils/lockUtils/acquireLock.js", () => ({
	acquireLock: async () => true,
}));
mock.module("@/external/redis/utils/lockUtils/clearLock.js", () => ({
	clearLock: async () => undefined,
}));
mock.module(
	"@/internal/balances/utils/paidAllocatedFeature/adjustAllowance.js",
	() => ({
		adjustAllowance: async (args: Record<string, unknown>) => {
			mockState.adjustAllowanceCalls.push(args);
			return { deletedReplaceables: [] };
		},
	}),
);
mock.module(
	"@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js",
	() => ({
		CusEntService: {
			decrement: async (args: Record<string, unknown>) => {
				mockState.decrementCalls.push(args);
			},
			update: async () => undefined,
		},
	}),
);

const { createEntityForCusProduct } = await import(
	// @ts-expect-error - Bun test cache-busting import query isolates module mocks.
	"@/internal/entities/handlers/handleCreateEntity/createEntityForCusProduct.js?seatCharge"
);

const FEATURE = {
	id: "seats",
	internal_id: "if_seats",
	name: "Seats",
	type: "continuous_use",
};

const buildContext = () =>
	({
		org: { id: "org_123" },
		env: AppEnv.Live,
		db: {},
		features: [FEATURE],
		extraLogs: {},
		logger: { warn: mock(() => {}), info: mock(() => {}), error: mock(() => {}) },
	}) as unknown as AutumnContext;

// A customer entitlement on the seat feature is what puts the create on the
// charging path at all; without one the block never runs.
const buildCusProduct = (): never =>
	({
		id: "cusprod_123",
		customer_entitlements: [
			{
				id: "cusent_123",
				balance: 0,
				replaceables: [],
				entitlement: {
					usage_limit: null,
					feature: FEATURE,
					internal_feature_id: "if_seats",
				},
				internal_feature_id: "if_seats",
				entities: {},
			},
		],
		customer_prices: [],
	}) as never;

const run = async ({ skipSeatCharge }: { skipSeatCharge: boolean }) =>
	createEntityForCusProduct({
		ctx: buildContext(),
		customer: { id: "customer_123", internal_id: "icus_123" } as never,
		cusProduct: buildCusProduct(),
		inputEntities: [{ id: "seat_1", name: "Seat", feature_id: "seats" }],
		skipSeatCharge,
	});

describe("seat charging on replay", () => {
	beforeEach(() => {
		mockState.adjustAllowanceCalls = [];
		mockState.decrementCalls = [];
	});

	test("a normal create still bills the seat", async () => {
		await run({ skipSeatCharge: false });

		expect(mockState.adjustAllowanceCalls).toHaveLength(1);
		expect(mockState.decrementCalls).toHaveLength(1);
	});

	test("a replay decrements the balance without billing", async () => {
		await run({ skipSeatCharge: true });

		expect(mockState.adjustAllowanceCalls).toHaveLength(0);
		// The ledger still has to move, otherwise the customer's remaining seats
		// stay overstated by every entity recovery ever replays.
		expect(mockState.decrementCalls).toEqual([
			expect.objectContaining({ id: "cusent_123", amount: 1 }),
		]);
	});
});
