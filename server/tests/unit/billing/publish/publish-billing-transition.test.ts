import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import {
	AppEnv,
	type AutumnBillingPlan,
	type BillingContext,
	type BillingPlan,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

const calls: string[] = [];
const publishedPlans: unknown[] = [];
const persistedTransitions: unknown[] = [];

await mockModuleWithRestore(
	"@/internal/customers/repos/getFullSubject/index.js",
	() => ({
		getFullSubjectNormalized: async () => {
			calls.push("load");
			return { normalized: { source: "primary" } };
		},
	}),
);
await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/actions/publishCachedFullSubject.js",
	() => ({
		publishCachedFullSubject: async ({
			balanceTransitionPlan,
		}: {
			balanceTransitionPlan: unknown;
		}) => {
			calls.push("publish");
			publishedPlans.push(balanceTransitionPlan);
			return {
				status: "OK",
				balanceTransitions: [{ customerEntitlementId: "target_messages" }],
			};
		},
	}),
);
await mockModuleWithRestore(
	"@/internal/billing/v2/publish/persistPublishedBalanceTransitions.js",
	() => ({
		persistOrQueuePublishedBalanceTransitions: async ({
			balanceTransitions,
		}: {
			balanceTransitions: unknown;
		}) => {
			calls.push("persist");
			persistedTransitions.push(balanceTransitions);
		},
	}),
);

const { publishBillingTransition } = await import(
	"@/internal/billing/v2/publish/publishBillingTransition.js"
);

const balanceTransitionPlan = {
	id: "target_product",
	outgoingCustomerEntitlements: [
		{
			id: "source_messages",
			feature_id: "messages",
			balance: 95,
		},
	],
	transitions: [
		{
			sourceCustomerEntitlementId: "source_messages",
			targetCustomerEntitlementId: "target_messages",
			sourceBalance: 95,
			sourceAdjustment: 0,
		},
	],
};
const autumnBillingPlan = {
	customerId: "customer_123",
	insertCustomerProducts: [],
	balanceTransitionPlan,
} as unknown as AutumnBillingPlan;
const billingPlan = { autumn: autumnBillingPlan, stripe: {} } as BillingPlan;
const billingContext = {
	fullCustomer: {
		id: "customer_123",
		internal_id: "internal_customer_123",
	},
} as BillingContext;
const ctx = {
	id: "request_123",
	org: { id: "org_123" },
	env: AppEnv.Sandbox,
	logger: {
		info: mock(() => {}),
		warn: mock(() => {}),
	},
} as unknown as AutumnContext;

beforeEach(() => {
	calls.length = 0;
	publishedPlans.length = 0;
	persistedTransitions.length = 0;
	ctx.skipCache = false;
	ctx.skipSubjectCacheDeletion = false;
});

test("publishes the exact transition emitted by compute", async () => {
	await publishBillingTransition({
		ctx,
		billingContext,
		billingPlan,
	});

	expect(calls).toEqual(["load", "publish", "persist"]);
	expect(publishedPlans).toEqual([balanceTransitionPlan]);
	expect(persistedTransitions).toEqual([
		[{ customerEntitlementId: "target_messages" }],
	]);
	expect(ctx.skipSubjectCacheDeletion).toBe(true);
});

test("logs a named compute rejection without touching cache state", async () => {
	const unsupportedPlan = {
		...billingPlan,
		autumn: {
			...autumnBillingPlan,
			balanceTransitionPlan: {
				...balanceTransitionPlan,
				unsupportedReason: "multi_entitlement_feature",
			},
		},
	} as BillingPlan;

	await publishBillingTransition({
		ctx,
		billingContext,
		billingPlan: unsupportedPlan,
	});

	expect(calls).toHaveLength(0);
	expect(ctx.logger.info).toHaveBeenCalledWith(
		{ unsupportedReason: "multi_entitlement_feature" },
		"[publishBillingTransition] Skipped unsupported balance transition",
	);
});

test("waits for deferred execution before publishing", async () => {
	await publishBillingTransition({
		ctx,
		billingContext,
		billingPlan,
		executionDeferred: true,
	});

	expect(calls).toHaveLength(0);
	expect(ctx.skipSubjectCacheDeletion).toBe(false);
});

test("publishes even when cache reads are skipped", async () => {
	ctx.skipCache = true;

	await publishBillingTransition({
		ctx,
		billingContext,
		billingPlan,
	});

	expect(calls).toEqual(["load", "publish", "persist"]);
	expect(ctx.skipSubjectCacheDeletion).toBe(true);
});

test("keeps compute-time exclusions after deferred plan serialization", async () => {
	const serializedPlan = JSON.parse(
		JSON.stringify({
			...billingPlan,
			autumn: {
				...autumnBillingPlan,
				balanceTransitionPlan: {
					...balanceTransitionPlan,
					unsupportedReason: "full_customer_override",
				},
			},
		}),
	) as BillingPlan;

	await publishBillingTransition({
		ctx,
		billingContext,
		billingPlan: serializedPlan,
	});

	expect(calls).toHaveLength(0);
	expect(ctx.logger.info).toHaveBeenCalledWith(
		{ unsupportedReason: "full_customer_override" },
		"[publishBillingTransition] Skipped unsupported balance transition",
	);
});

afterAll(() => {
	mock.restore();
});
