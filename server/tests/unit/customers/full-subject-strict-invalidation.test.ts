import { expect, test } from "bun:test";
import type { Redis } from "ioredis";
import { shouldFlushSharedBalanceFields } from "@/internal/customers/cache/fullSubject/actions/invalidate/invalidateFullSubject.js";

test("strict invalidation captures authoritative shared balances even when flush is omitted", () => {
	const authoritativeRedis = {} as Redis;
	expect(
		shouldFlushSharedBalanceFields({
			targetRedis: authoritativeRedis,
			authoritativeRedis,
			balanceCaptureMode: "strict",
		}),
	).toBe(true);
});

test("secondary caches never flush captured balances", () => {
	expect(
		shouldFlushSharedBalanceFields({
			targetRedis: {} as Redis,
			authoritativeRedis: {} as Redis,
			flushBalances: true,
			balanceCaptureMode: "strict",
		}),
	).toBe(false);
});
