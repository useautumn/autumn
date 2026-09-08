import { expect, test } from "bun:test";
import type { Redis } from "ioredis";
import type { BalanceObservation } from "@/internal/balances/shadow/balanceObservation.js";
import { executeRedisDeductionV2 } from "@/internal/balances/utils/deductionV2/executeRedisDeductionV2.js";
import { createCaptureFixture } from "./utils/captureFixture.js";

test("hands off a rejected decision before the existing error propagates", async () => {
	const fixture = createCaptureFixture();
	const calls: Record<string, unknown>[] = [];
	const observation: BalanceObservation = {
		...fixture.observation,
		decision: "rejected",
		requestedValue: 100,
		after: fixture.observation.before,
	};
	const redis = {
		status: "ready",
		deductFromSubjectBalances: async (...args: unknown[]) => {
			calls.push(JSON.parse(String(args.at(-1))));
			return JSON.stringify({ error: "INSUFFICIENT_BALANCE", observation });
		},
	} as Redis;
	const ctx = {
		...fixture.ctx,
		org: { ...fixture.ctx.org, config: { ...fixture.ctx.org.config } },
		balanceObservationCapture: fixture.capture,
	};
	await expect(
		executeRedisDeductionV2({
			ctx,
			fullSubject: fixture.fullSubject,
			redisInstance: redis,
			deductions: [
				{
					feature: fixture.customerEntitlement.entitlement.feature,
					deduction: 100,
				},
			],
			deductionOptions: { overageBehaviour: "reject" },
		}),
	).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
	expect(fixture.received).toEqual([observation]);
	expect(calls[0].observation).toMatchObject({
		kind: "deduct",
		request_id: fixture.ctx.id,
	});
});
