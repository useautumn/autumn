/**
 * Entity recovery must not change the normal create transaction boundary.
 *
 * Red (current): stable-ID creates wrap insert + defaults in a transaction, so
 * a default-attachment failure rolls back the entity and queues a replay.
 * Green (after): only a failed insert is captured; a successful normal insert
 * stays committed and later failures do not enter entity recovery.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { ApiVersion, ApiVersionClass, AppEnv } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const transientError = Object.assign(new Error("connect timeout"), {
	code: "CONNECT_TIMEOUT",
});

const state = {
	attachCalls: 0,
	entityCommitted: false,
	failure: undefined as "seat" | "insert" | "attach" | undefined,
	insertCalls: 0,
	queueCalls: [] as Record<string, unknown>[],
	seatChargeCalls: 0,
	transactionCalls: 0,
};

const transactionDb = { name: "transaction" };
let requestDb: object;

const mockedPaths = [
	"@/external/redis/utils/lockUtils/withLock.js",
	"@/internal/api/entities/EntityService.js",
	"@/internal/entities/recovery/queueFailedEntityCreation.js",
	"@/internal/entities/handlers/handleCreateEntity/createEntityForCusProduct.js",
	"@/internal/entities/handlers/handleCreateEntity/getInputEntities.js",
	"@/internal/entities/actions/batchCreateEntities/attachDefaultProductsToEntities.js",
] as const;
const realModules = new Map<string, Record<string, unknown>>();
for (const path of mockedPaths) {
	realModules.set(path, { ...(await import(path)) });
}

afterAll(() => {
	for (const [path, realModule] of realModules) {
		mock.module(path, () => realModule);
	}
});

mock.module("@/external/redis/utils/lockUtils/withLock.js", () => ({
	withLock: async ({ fn }: { fn: () => Promise<unknown> }) => fn(),
}));

mock.module("@/internal/api/entities/EntityService.js", () => ({
	EntityService: {
		insert: async ({ db, data }: { db: object; data: unknown[] }) => {
			state.insertCalls++;
			if (state.failure === "insert") throw transientError;
			if (db === requestDb) state.entityCommitted = true;
			return data;
		},
		update: async () => {
			throw new Error("unexpected placeholder update");
		},
	},
}));

mock.module(
	"@/internal/entities/recovery/queueFailedEntityCreation.js",
	() => ({
		queueFailedEntityCreation: async (args: Record<string, unknown>) => {
			state.queueCalls.push(args);
			return true;
		},
	}),
);

mock.module(
	"@/internal/entities/handlers/handleCreateEntity/createEntityForCusProduct.js",
	() => ({
		createEntityForCusProduct: async () => {
			state.seatChargeCalls++;
			if (state.failure === "seat") throw transientError;
		},
	}),
);

mock.module(
	"@/internal/entities/handlers/handleCreateEntity/getInputEntities.js",
	() => ({
		validateAndGetInputEntities: async () => ({
			customer: {
				id: "customer_123",
				internal_id: "customer_internal_123",
			},
			inputEntities: [
				{ id: "entity_123", name: "Entity", feature_id: "seats" },
			],
			cusProducts: [{}],
			existingEntities: [],
		}),
	}),
);

mock.module(
	"@/internal/entities/actions/batchCreateEntities/attachDefaultProductsToEntities.js",
	() => ({
		attachDefaultProductsToEntities: async () => {
			state.attachCalls++;
			if (state.failure === "attach") throw transientError;
		},
	}),
);

const { batchCreateEntities } = await import(
	// @ts-expect-error Bun test cache-busting import query isolates module mocks.
	"@/internal/entities/actions/batchCreateEntities.js?entityRecoveryBoundary"
);

const buildContext = () => {
	requestDb = {
		transaction: async (fn: (db: object) => Promise<unknown>) => {
			state.transactionCalls++;
			return fn(transactionDb);
		},
	};

	return {
		id: "request_123",
		org: { id: "org_123" },
		env: AppEnv.Live,
		apiVersion: new ApiVersionClass(ApiVersion.V2_1),
		features: [
			{ id: "seats", internal_id: "feature_internal_123", name: "Seats" },
		],
		extraLogs: {},
		db: requestDb,
		logger: {
			warn: mock(() => {}),
			error: mock(() => {}),
		},
	} as unknown as AutumnContext;
};

const createEntity = ({ ctx }: { ctx: AutumnContext }) =>
	batchCreateEntities({
		ctx,
		customerId: "customer_123",
		createEntityData: {
			id: "entity_123",
			name: "Entity",
			feature_id: "seats",
		},
	});

describe("batchCreateEntities recovery boundary", () => {
	beforeEach(() => {
		state.attachCalls = 0;
		state.entityCommitted = false;
		state.failure = undefined;
		state.insertCalls = 0;
		state.queueCalls = [];
		state.seatChargeCalls = 0;
		state.transactionCalls = 0;
	});

	test("keeps a successful normal insert committed when default attachment fails", async () => {
		state.failure = "attach";

		await expect(createEntity({ ctx: buildContext() })).rejects.toBe(
			transientError,
		);

		expect(state.entityCommitted).toBe(true);
		expect(state.transactionCalls).toBe(0);
		expect(state.queueCalls).toHaveLength(0);
	});

	test("captures only a transient stable-ID insert failure", async () => {
		state.failure = "insert";
		const ctx = buildContext();

		await expect(createEntity({ ctx })).rejects.toMatchObject({
			statusCode: 503,
		});

		expect(state.seatChargeCalls).toBe(1);
		expect(state.attachCalls).toBe(0);
		expect(state.entityCommitted).toBe(false);
		expect(state.transactionCalls).toBe(0);
		expect(state.queueCalls).toEqual([
			expect.objectContaining({
				ctx,
				params: expect.objectContaining({
					customer_id: "customer_123",
					create_entity_data: [
						{ id: "entity_123", name: "Entity", feature_id: "seats" },
					],
				}),
			}),
		]);
	});

	test("does not capture a seat-bookkeeping failure", async () => {
		state.failure = "seat";

		await expect(createEntity({ ctx: buildContext() })).rejects.toBe(
			transientError,
		);

		expect(state.insertCalls).toBe(0);
		expect(state.queueCalls).toHaveLength(0);
	});
});
