import { beforeEach, describe, expect, test } from "bun:test";
import type { AutumnBillingPlan, NormalizedFullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { PreparedAttachBalanceHandoff } from "@/internal/billing/v2/execute/attachBalanceHandoff/prepareAttachBalanceHandoff.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const sourceNormalized = {
	balanceGeneration: 4,
	customer_entitlements: [
		{ id: "source_balance", cache_version: 7, rollovers: [] },
	],
	usage_windows: [],
} as unknown as NormalizedFullSubject;
const postgresNormalized = {
	balanceGeneration: 4,
	customer_entitlements: [],
	usage_windows: [],
} as unknown as NormalizedFullSubject;
const targetNormalized = {
	balanceGeneration: 5,
	customer_entitlements: [
		{ id: "target_balance", cache_version: 0, rollovers: [] },
	],
	usage_windows: [],
} as unknown as NormalizedFullSubject;
const state = {
	events: [] as string[],
	switchStatus: "switched" as "switched" | "conflict",
};

await mockModuleWithRestore(
	"@/internal/customers/repos/getFullSubject/index.js",
	() => ({
		getFullSubjectNormalized: async ({ entityId }: { entityId?: string }) => {
			expect(entityId).toBe("entity_1");
			state.events.push("load-normalized");
			return { normalized: postgresNormalized, fullSubject: {} };
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/billing/v2/execute/attachBalanceHandoff/buildAttachBalanceHandoffTarget.js",
	() => ({
		buildAttachBalanceHandoffTarget: (args: Record<string, unknown>) => {
			expect(args).not.toHaveProperty("nextGeneration");
			state.events.push("build-target");
			return targetNormalized;
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/billing/v2/execute/attachBalanceHandoff/persistAttachBalanceHandoffRuntime.js",
	() => ({
		persistAttachBalanceHandoffRuntime: async ({
			source,
			target,
			allowedCacheVersionsById,
		}: {
			source: NormalizedFullSubject;
			target: NormalizedFullSubject;
			allowedCacheVersionsById: Map<string, number[]>;
		}) => {
			expect(source.customer_entitlements[0]?.cache_version).toBe(8);
			expect(target.customer_entitlements[0]?.cache_version).toBe(1);
			expect(allowedCacheVersionsById.get("source_balance")).toEqual([7, 8]);
			expect(allowedCacheVersionsById.get("target_balance")).toEqual([0, 1]);
			state.events.push("persist-target");
		},
	}),
);

await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/actions/switchFullSubjectBalanceGeneration.js",
	() => ({
		switchFullSubjectBalanceGeneration: async ({
			customerId,
			entityId,
			expectedGeneration,
			lockToken,
			buildTargetFromSnapshot,
			prepareTargetForSwitch,
		}: {
			customerId: string;
			entityId?: string;
			expectedGeneration: number;
			lockToken: string;
			buildTargetFromSnapshot: (args: {
				snapshot: { normalized: NormalizedFullSubject };
			}) => Promise<NormalizedFullSubject> | NormalizedFullSubject;
			prepareTargetForSwitch: (args: {
				snapshot: { normalized: NormalizedFullSubject };
				target: { normalized: NormalizedFullSubject };
			}) => Promise<void>;
		}) => {
			state.events.push("switch-started");
			expect(customerId).toBe("customer_1");
			expect(entityId).toBe("entity_1");
			expect(expectedGeneration).toBe(4);
			expect(lockToken).toBe("lock_token_1");
			if (state.switchStatus === "conflict") {
				return { status: "conflict", reason: "test-conflict" };
			}
			const snapshot = { normalized: sourceNormalized };
			const normalized = await buildTargetFromSnapshot({ snapshot });
			await prepareTargetForSwitch({
				snapshot,
				target: { normalized },
			});
			state.events.push("redis-published");
			return {
				status: "switched",
				snapshot,
				target: { normalized },
			};
		},
	}),
);

const { executeAttachBalanceHandoff } = await import(
	"@/internal/billing/v2/execute/attachBalanceHandoff/executeAttachBalanceHandoff.js"
);

const autumnBillingPlan = {
	customerId: "customer_1",
	insertCustomerProducts: [{ id: "target_product", customer_entitlements: [] }],
	attachBalanceHandoff: {
		targetCustomerProductId: "target_product",
		entityId: "entity_1",
	},
} as unknown as AutumnBillingPlan;
const prepared: PreparedAttachBalanceHandoff = {
	expectedGeneration: 4,
	lockToken: "lock_token_1",
};

describe("executeAttachBalanceHandoff", () => {
	beforeEach(() => {
		state.events = [];
		state.switchStatus = "switched";
	});

	test("fences and persists the exact target before publishing B", async () => {
		const ctx = {
			org: { id: "org_1" },
			env: "sandbox",
			preserveFullSubjectCache: false,
			redisV2: { refreshOwnedLock: async () => 1 },
		} as unknown as AutumnContext;
		await executeAttachBalanceHandoff({
			ctx,
			autumnBillingPlan,
			prepared,
		});

		expect(state.events.indexOf("build-target")).toBeLessThan(
			state.events.indexOf("persist-target"),
		);
		expect(state.events.indexOf("persist-target")).toBeLessThan(
			state.events.indexOf("redis-published"),
		);
		expect(ctx.preserveFullSubjectCache).toBe(true);
	});

	test("preserves A when the Redis compare-and-switch loses", async () => {
		state.switchStatus = "conflict";
		const ctx = {
			org: { id: "org_1" },
			env: "sandbox",
			preserveFullSubjectCache: false,
			redisV2: { refreshOwnedLock: async () => 1 },
		} as unknown as AutumnContext;

		await expect(
			executeAttachBalanceHandoff({
				ctx,
				autumnBillingPlan,
				prepared,
			}),
		).rejects.toThrow("test-conflict");
		expect(ctx.preserveFullSubjectCache).toBe(true);
	});
});
