import { describe, expect, test } from "bun:test";
import type { Feature } from "@autumn/shared";
import {
	buildCascadeCompensationFailureError,
	CascadeSpill,
	isCascadeBusinessRejection,
} from "@/internal/balances/utils/deductionV2/cascadeSpill.js";
import type { FeatureDeduction } from "@/internal/balances/utils/types/featureDeduction.js";
import type { MutationLogItem } from "@/internal/balances/utils/types/mutationLogItem.js";
import {
	RedisDeductionError,
	RedisDeductionErrorCode,
} from "@/internal/balances/utils/types/redisDeductionError.js";

const includedFeature = { id: "ai_included" } as Feature;
const overageFeature = { id: "ai_overage" } as Feature;

const tokens = {
	usage: { modelName: "custom/model", inputTokens: 100, outputTokens: 50 },
	cost: 4,
};

const includedDeduction: FeatureDeduction = {
	feature: includedFeature,
	deduction: 1,
	tokens,
	cascade: { role: "included" },
};

const overageDeduction: FeatureDeduction = {
	feature: overageFeature,
	deduction: 1,
	tokens: { ...tokens, cost: 6 },
	cascade: { role: "overage" },
};

const plainDeduction: FeatureDeduction = {
	feature: includedFeature,
	deduction: 5,
};

const mutationLog: MutationLogItem = {
	target_type: "customer_entitlement",
	customer_entitlement_id: "cus_ent_1",
	rollover_id: null,
	entity_id: null,
	credit_cost: 4,
	balance_delta: -2,
	adjustment_delta: 0,
	usage_delta: 0,
	value_delta: 0.5,
};

describe("CascadeSpill", () => {
	test("included legs always run with cap; others keep the request behaviour", () => {
		const spill = new CascadeSpill();
		expect(
			spill.effectiveOverageBehaviour({
				deduction: includedDeduction,
				requestBehaviour: "reject",
			}),
		).toBe("cap");
		expect(
			spill.effectiveOverageBehaviour({
				deduction: overageDeduction,
				requestBehaviour: "reject",
			}),
		).toBe("reject");
		expect(
			spill.effectiveOverageBehaviour({
				deduction: plainDeduction,
				requestBehaviour: "allow",
			}),
		).toBe("allow");
	});

	test("overage amount scales by the included leg's remaining fraction", () => {
		const spill = new CascadeSpill();
		spill.recordIncludedResult({
			deduction: includedDeduction,
			remaining: 0.5,
			mutationLogs: [mutationLog],
		});
		expect(spill.effectiveAmount({ deduction: overageDeduction })).toBe(0.5);
		expect(spill.effectiveAmount({ deduction: plainDeduction })).toBe(5);
	});

	test("overage amount stays unscaled when no included leg was recorded", () => {
		const spill = new CascadeSpill();
		expect(spill.effectiveAmount({ deduction: overageDeduction })).toBe(1);
	});

	test("remaining is clamped to [0, deduction] and float residue rounds to zero", () => {
		const spill = new CascadeSpill();
		spill.recordIncludedResult({
			deduction: includedDeduction,
			remaining: 1e-15,
			mutationLogs: [mutationLog],
		});
		expect(spill.effectiveAmount({ deduction: overageDeduction })).toBe(0);

		spill.recordIncludedResult({
			deduction: includedDeduction,
			remaining: 7,
			mutationLogs: [mutationLog],
		});
		expect(spill.effectiveAmount({ deduction: overageDeduction })).toBe(1);

		spill.recordIncludedResult({
			deduction: includedDeduction,
			remaining: -3,
			mutationLogs: [mutationLog],
		});
		expect(spill.effectiveAmount({ deduction: overageDeduction })).toBe(0);
	});

	test("non-included results are ignored", () => {
		const spill = new CascadeSpill();
		spill.recordIncludedResult({
			deduction: overageDeduction,
			remaining: 0.5,
			mutationLogs: [mutationLog],
		});
		spill.recordIncludedResult({
			deduction: plainDeduction,
			remaining: 0.5,
			mutationLogs: [mutationLog],
		});
		expect(spill.effectiveAmount({ deduction: overageDeduction })).toBe(1);
		expect(spill.buildCompensation()).toBeNull();
	});

	test("compensation reverses exactly what the included leg consumed", () => {
		const spill = new CascadeSpill();
		spill.recordIncludedResult({
			deduction: includedDeduction,
			remaining: 0.5,
			mutationLogs: [mutationLog],
		});

		const compensation = spill.buildCompensation();
		expect(compensation).toMatchObject({
			feature: includedFeature,
			deduction: 0,
			unwindValue: 0.5,
			unwindItems: [mutationLog],
		});
	});

	test("no compensation when the included leg consumed nothing", () => {
		const spill = new CascadeSpill();
		expect(spill.buildCompensation()).toBeNull();

		spill.recordIncludedResult({
			deduction: includedDeduction,
			remaining: 1,
			mutationLogs: [],
		});
		expect(spill.buildCompensation()).toBeNull();
	});

	test("no compensation for an unlimited short-circuit (no balance mutations)", () => {
		const spill = new CascadeSpill();
		spill.recordIncludedResult({
			deduction: includedDeduction,
			remaining: 0,
			mutationLogs: [],
		});
		expect(spill.effectiveAmount({ deduction: overageDeduction })).toBe(0);
		expect(spill.buildCompensation()).toBeNull();
	});

	test("business overage rejections are not replayable compensation failures", () => {
		const redisRejection = new RedisDeductionError({
			message: "Redis deduction failed: INSUFFICIENT_BALANCE",
			code: RedisDeductionErrorCode.InsufficientBalance,
		});

		expect(isCascadeBusinessRejection(redisRejection)).toBe(true);
		expect(
			isCascadeBusinessRejection(
				new Error("INSUFFICIENT_BALANCE|featureId:credits|value:1"),
			),
		).toBe(true);
		expect(isCascadeBusinessRejection(new Error("REDIS_UNAVAILABLE"))).toBe(
			false,
		);

		const compensationFailure = buildCascadeCompensationFailureError({
			source: "test",
			error: redisRejection,
		});
		expect(compensationFailure.message).not.toContain("INSUFFICIENT_BALANCE");
		expect(compensationFailure.statusCode).toBe(500);
	});
});
