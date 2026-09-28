import { beforeEach, describe, expect, test } from "bun:test";
import { AppEnv, type Subscription } from "@autumn/shared";
import {
	buildSubscriptionCacheKey,
	getCachedSubscriptions,
	invalidateSubscriptionCache,
	SUBSCRIPTION_CACHE_TTL_SECONDS,
	setCachedSubscriptions,
} from "../../../src/cache.js";
import { createFakeReadThroughCache } from "../utils/fakeReadThroughCache.js";

const { ctx, main, backup, reset, setStatus } = createFakeReadThroughCache();

const subscription = ({ stripeId }: { stripeId: string }): Subscription => ({
	id: `sub_${stripeId}`,
	stripe_id: stripeId,
	stripe_schedule_id: null,
	created_at: 1_700_000_000_000,
	usage_features: [],
	org_id: "org_1",
	current_period_start: 1_700_000_000,
	current_period_end: 1_702_592_000,
	billing_cycle_anchor_seconds: 1_700_000_000,
	env: AppEnv.Sandbox,
});

beforeEach(reset);

describe("subscription cache", () => {
	test("a miss lists the id as missing; a set fills it with the TTL", async () => {
		const empty = await getCachedSubscriptions({ ctx, stripeIds: ["sub_A"] });
		expect(empty).toEqual({ found: [], missingStripeIds: ["sub_A"] });

		await setCachedSubscriptions({
			ctx,
			subscriptions: [subscription({ stripeId: "sub_A" })],
		});
		expect(main.calls.at(-1)).toBe(
			`set:${buildSubscriptionCacheKey({ stripeId: "sub_A" })}:EX:${SUBSCRIPTION_CACHE_TTL_SECONDS}`,
		);

		const hit = await getCachedSubscriptions({ ctx, stripeIds: ["sub_A"] });
		expect(hit.found).toEqual([subscription({ stripeId: "sub_A" })]);
		expect(hit.missingStripeIds).toEqual([]);
	});

	test("a partial hit splits found from missing", async () => {
		await setCachedSubscriptions({
			ctx,
			subscriptions: [subscription({ stripeId: "sub_A" })],
		});
		const result = await getCachedSubscriptions({
			ctx,
			stripeIds: ["sub_A", "sub_B"],
		});
		expect(result.found.map(({ stripe_id }) => stripe_id)).toEqual(["sub_A"]);
		expect(result.missingStripeIds).toEqual(["sub_B"]);
	});

	test("a corrupt payload is a miss, not an error", async () => {
		main.store.set(buildSubscriptionCacheKey({ stripeId: "sub_A" }), "{");
		const result = await getCachedSubscriptions({ ctx, stripeIds: ["sub_A"] });
		expect(result).toEqual({ found: [], missingStripeIds: ["sub_A"] });
	});

	test("a row without a stripe id is never written", async () => {
		await setCachedSubscriptions({
			ctx,
			subscriptions: [{ ...subscription({ stripeId: "x" }), stripe_id: null }],
		});
		expect(main.calls).toEqual([]);
	});

	test("invalidate drops the key on every target and skips empty ids", async () => {
		const key = buildSubscriptionCacheKey({ stripeId: "sub_A" });
		main.store.set(key, "{}");
		backup.store.set(key, "{}");

		await invalidateSubscriptionCache({
			ctx,
			stripeIds: ["sub_A", null, undefined, ""],
		});
		expect(main.store.has(key)).toBe(false);
		expect(backup.store.has(key)).toBe(false);
		expect(main.calls).toEqual([`del:${key}`]);
		expect(backup.calls).toEqual([`del:${key}`]);
	});

	test("a client that is not ready fails open on every operation", async () => {
		setStatus("connecting");
		const result = await getCachedSubscriptions({ ctx, stripeIds: ["sub_A"] });
		expect(result).toEqual({ found: [], missingStripeIds: ["sub_A"] });
		await setCachedSubscriptions({
			ctx,
			subscriptions: [subscription({ stripeId: "sub_A" })],
		});
		await invalidateSubscriptionCache({ ctx, stripeIds: ["sub_A"] });
		expect(main.store.size).toBe(0);
	});
});
