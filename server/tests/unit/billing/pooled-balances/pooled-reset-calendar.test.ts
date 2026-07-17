import { afterEach, expect, test } from "bun:test";
import { EntInterval, PooledBalanceResetMode } from "@autumn/shared";
import { getNextPooledBalanceResetAt } from "@/internal/billing/v2/pooledBalances/reset/getNextPooledBalanceResetAt.js";

const realDateNow = Date.now;
const ctx = {
	org: { id: "org_1" },
	env: "sandbox",
};

afterEach(() => {
	Date.now = realDateNow;
});

test("lazy pooled resets follow the standard clamped calendar transition", async () => {
	const january31 = Date.UTC(2027, 0, 31, 12);
	const february28 = Date.UTC(2027, 1, 28, 12);
	const march28 = Date.UTC(2027, 2, 28, 12);

	Date.now = () => Date.UTC(2027, 1, 1);
	expect(
		await getNextPooledBalanceResetAt({
			ctx: ctx as never,
			resetMode: PooledBalanceResetMode.Lazy,
			currentResetAt: january31,
			interval: EntInterval.Month,
			intervalCount: 1,
		}),
	).toBe(february28);

	Date.now = () => Date.UTC(2027, 2, 1);
	expect(
		await getNextPooledBalanceResetAt({
			ctx: ctx as never,
			resetMode: PooledBalanceResetMode.Lazy,
			currentResetAt: february28,
			interval: EntInterval.Month,
			intervalCount: 1,
		}),
	).toBe(march28);
});

test("a late lazy reset catches up from each prior boundary and honors interval_count", async () => {
	const january31 = Date.UTC(2027, 0, 31, 12);
	Date.now = () => Date.UTC(2027, 3, 1);

	expect(
		await getNextPooledBalanceResetAt({
			ctx: ctx as never,
			resetMode: PooledBalanceResetMode.Lazy,
			currentResetAt: january31,
			interval: EntInterval.Month,
			intervalCount: 1,
		}),
	).toBe(Date.UTC(2027, 3, 28, 12));

	expect(
		await getNextPooledBalanceResetAt({
			ctx: ctx as never,
			resetMode: PooledBalanceResetMode.Lazy,
			currentResetAt: january31,
			interval: EntInterval.Month,
			intervalCount: 2,
		}),
	).toBe(Date.UTC(2027, 4, 31, 12));
});

test("subscription pooled resets use the exact forward Stripe period end", async () => {
	const currentResetAt = Date.UTC(2027, 0, 31, 12);
	const stripeSubscriptionPeriodEnd = Date.UTC(2027, 2, 17, 9, 30);

	expect(
		await getNextPooledBalanceResetAt({
			ctx: ctx as never,
			resetMode: PooledBalanceResetMode.Subscription,
			currentResetAt,
			interval: EntInterval.Month,
			intervalCount: 3,
			subscriptionNextResetAt: stripeSubscriptionPeriodEnd,
		}),
	).toBe(stripeSubscriptionPeriodEnd);
});

test("a due subscription reset rejects a missing Stripe period end", async () => {
	const currentResetAt = Date.UTC(2027, 0, 31, 12);

	await expect(
		getNextPooledBalanceResetAt({
			ctx: ctx as never,
			resetMode: PooledBalanceResetMode.Subscription,
			currentResetAt,
			interval: EntInterval.Month,
			intervalCount: 1,
		}),
	).rejects.toThrow("Stripe-aligned next reset boundary");
});

test("an already-applied or older subscription invoice is an idempotent no-op", async () => {
	const currentResetAt = Date.UTC(2027, 1, 28, 12);
	for (const subscriptionNextResetAt of [
		currentResetAt,
		Date.UTC(2027, 0, 31, 12),
	]) {
		expect(
			await getNextPooledBalanceResetAt({
				ctx: ctx as never,
				resetMode: PooledBalanceResetMode.Subscription,
				currentResetAt,
				interval: EntInterval.Month,
				intervalCount: 1,
				subscriptionNextResetAt,
			}),
		).toBeNull();
	}
});
