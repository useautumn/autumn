import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AppEnv, type AutumnBillingPlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { MiscellaneousEdgeConfigSchema } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigSchemas.js";
import { _setMiscellaneousEdgeConfigForTesting } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const state = {
	events: [] as string[],
	entityIds: [] as (string | undefined)[],
	cacheAvailable: true,
	lockAvailable: true,
	releasedLocks: [] as string[],
};

await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js",
	() => ({
		getOrSetCachedFullSubject: async ({ entityId }: { entityId?: string }) => {
			state.events.push("cache-a");
			state.entityIds.push(entityId);
			return {};
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/actions/getCachedFullSubject.js",
	() => ({
		getCachedFullSubject: async ({ entityId }: { entityId?: string }) => {
			state.events.push("reserve-a");
			state.entityIds.push(entityId);
			return {
				fullSubject: state.cacheAvailable ? {} : undefined,
				balanceGeneration: 6,
			};
		},
	}),
);

const { prepareAttachBalanceHandoff } = await import(
	"@/internal/billing/v2/execute/attachBalanceHandoff/prepareAttachBalanceHandoff.js"
);

const ctx = {
	org: { id: "org_1" },
	env: AppEnv.Sandbox,
	redisV2: {
		set: async () => (state.lockAvailable ? "OK" : null),
		deleteOwnedLock: async (_key: string, token: string) => {
			state.releasedLocks.push(token);
			return 1;
		},
	},
} as unknown as AutumnContext;
const defaultConfig = MiscellaneousEdgeConfigSchema.parse({});
const setHandoffEnabled = (enabled: boolean) => {
	_setMiscellaneousEdgeConfigForTesting({
		config: {
			...defaultConfig,
			balanceGenerationHandoff: enabled,
		},
	});
};
const plan = ({ enabled, entityId }: { enabled: boolean; entityId?: string }) =>
	({
		customerId: "customer_1",
		attachBalanceHandoff: enabled
			? {
					sourceCustomerProductId: "source_product",
					targetCustomerProductId: "target_product",
					entityId,
				}
			: undefined,
	}) as AutumnBillingPlan;

describe("prepareAttachBalanceHandoff", () => {
	beforeEach(() => {
		state.events = [];
		state.entityIds = [];
		state.cacheAvailable = true;
		state.lockAvailable = true;
		state.releasedLocks = [];
		setHandoffEnabled(true);
	});

	afterEach(() => {
		_setMiscellaneousEdgeConfigForTesting({ config: defaultConfig });
	});

	test("caches A and remembers only its Redis generation", async () => {
		const prepared = await prepareAttachBalanceHandoff({
			ctx,
			autumnBillingPlan: plan({ enabled: true, entityId: "entity_1" }),
		});

		expect(prepared).toEqual({
			expectedGeneration: 6,
			lockToken: expect.any(String),
		});
		expect(state.events).toEqual(["cache-a", "reserve-a"]);
		expect(state.entityIds).toEqual(["entity_1", "entity_1"]);
	});

	test("does nothing for a plan without a balance handoff", async () => {
		expect(
			await prepareAttachBalanceHandoff({
				ctx,
				autumnBillingPlan: plan({ enabled: false }),
			}),
		).toBeUndefined();
		expect(state.events).toEqual([]);
	});

	test("does not execute a stored recipe after the kill switch is disabled", async () => {
		setHandoffEnabled(false);

		expect(
			await prepareAttachBalanceHandoff({
				ctx,
				autumnBillingPlan: plan({ enabled: true, entityId: "entity_1" }),
			}),
		).toBeUndefined();
		expect(state.events).toEqual([]);
	});

	test("fails before billing writes when A cannot be snapshotted", async () => {
		state.cacheAvailable = false;
		await expect(
			prepareAttachBalanceHandoff({
				ctx,
				autumnBillingPlan: plan({ enabled: true }),
			}),
		).rejects.toThrow("reserve the live balance handoff");
		expect(state.releasedLocks).toHaveLength(1);
	});

	test("fails before billing writes when sync conflict resolution owns the lock", async () => {
		state.lockAvailable = false;
		await expect(
			prepareAttachBalanceHandoff({
				ctx,
				autumnBillingPlan: plan({ enabled: true }),
			}),
		).rejects.toThrow("reserve the live balance handoff");
		expect(state.events).toEqual(["cache-a"]);
	});
});
