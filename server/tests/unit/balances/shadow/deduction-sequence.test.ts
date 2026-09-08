import { expect, test } from "bun:test";
import type { Redis } from "ioredis";
import type { BalanceObservation } from "@/internal/balances/shadow/balanceObservation.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";
import { createCaptureFixture } from "./utils/captureFixture.js";

await mockModuleWithRestore(
	"@/internal/balances/trackWebhooks/fireTrackWebhooks.js",
	() => ({ fireTrackWebhooks: () => {} }),
);
const { executeRedisDeductionV2 } = await import(
	// @ts-expect-error Bun isolates this call boundary from other test mocks.
	"@/internal/balances/utils/deductionV2/executeRedisDeductionV2.js?observationSequence"
);

function createExecution({ responses }: { responses: unknown[] }) {
	const fixture = createCaptureFixture();
	const calls: Record<string, unknown>[] = [];
	const redis = {
		status: "ready",
		deductFromSubjectBalances: async (...args: unknown[]) => {
			calls.push(JSON.parse(String(args.at(-1))));
			return JSON.stringify(responses.shift());
		},
	} as Redis;
	const ctx = {
		...fixture.ctx,
		org: { ...fixture.ctx.org, config: { ...fixture.ctx.org.config } },
		balanceObservationCapture: fixture.capture,
	};
	const input = {
		ctx,
		fullSubject: fixture.fullSubject,
		redisInstance: redis,
		deductions: [{ feature: fixture.feature, deduction: 5 }],
	};
	return { ...fixture, calls, input };
}

test("a later feature failure does not discard an already captured Redis mutation", async () => {
	const responses: unknown[] = [];
	const execution = createExecution({ responses });
	responses.push({
		observation: execution.observation,
		updates: {
			messages_grant: {
				balance: 67,
				adjustment: 10,
				additional_balance: 0,
				entities: {},
				deducted: 5,
			},
		},
		rollover_updates: {},
		mutation_logs: [],
		modified_customer_entitlement_ids: ["messages_grant"],
	});
	const rejected: BalanceObservation = {
		...execution.observation,
		featureId: "excluded",
		sequence: "2",
		kind: "skip",
		decision: "rejected",
		before: null,
		after: null,
	};
	responses.push({ error: "INSUFFICIENT_BALANCE", observation: rejected });
	execution.input.deductions.push({
		feature: { ...execution.feature, id: "excluded" },
		deduction: 100,
	});
	await expect(executeRedisDeductionV2(execution.input)).rejects.toMatchObject({
		code: "INSUFFICIENT_BALANCE",
	});
	expect(execution.received).toEqual([execution.observation, rejected]);
	expect(
		execution.input.fullSubject.customer_products[0].customer_entitlements[0]
			.balance,
	).toBe(67);
});

test("a stale-epoch refresh captures only the eventual decision", async () => {
	const responses: unknown[] = [{ error: "SUBJECT_VIEW_CHANGED" }];
	const execution = createExecution({ responses });
	const observation: BalanceObservation = {
		...execution.observation,
		epoch: 1,
		decision: "rejected",
		after: execution.observation.before,
	};
	responses.push({ error: "INSUFFICIENT_BALANCE", observation });
	await expect(
		executeRedisDeductionV2({
			...execution.input,
			expectedSubjectViewEpoch: 0,
			refreshFullSubject: async () => ({
				...execution.fullSubject,
				subjectViewEpoch: 1,
			}),
		}),
	).rejects.toMatchObject({ code: "INSUFFICIENT_BALANCE" });
	expect(execution.received).toEqual([observation]);
	expect(execution.failures).toEqual([]);
	expect(
		execution.calls.map((call) => call.expected_subject_view_epoch),
	).toEqual([0, 1]);
});

test("the source handoff does not change a live error even when both observer callbacks throw", async () => {
	const responses: unknown[] = [];
	const execution = createExecution({ responses });
	responses.push({
		error: "INSUFFICIENT_BALANCE",
		observation: execution.observation,
	});
	execution.capture.tryEnqueue = () => {
		throw new Error("queue down");
	};
	execution.capture.onUnavailable = () => {
		throw new Error("metrics down");
	};
	await expect(executeRedisDeductionV2(execution.input)).rejects.toMatchObject({
		code: "INSUFFICIENT_BALANCE",
	});
});
