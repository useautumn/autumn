import { describe, expect, test } from "bun:test";
import { FeatureType, InsufficientBalanceError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getQueuedTrackFeatureDeductions } from "@/internal/balances/track/runQueuedTrack.js";
import { getTokenCascadeDeductionsFromBody } from "@/internal/balances/track/utils/getFeatureDeductions.js";
import { handleRedisTrackError } from "@/internal/balances/track/utils/handleRedisTrackError.js";
import { handleRedisTrackErrorV3 } from "@/internal/balances/track/v3/handleRedisTrackErrorV3.js";
import {
	attachCascadeReplayState,
	getCascadeReplayState,
} from "@/internal/balances/utils/types/cascadeReplayState.js";
import {
	RedisDeductionError,
	RedisDeductionErrorCode,
} from "@/internal/balances/utils/types/redisDeductionError.js";

const createCtx = (): AutumnContext =>
	({
		features: [
			{ id: "ai_included", type: FeatureType.AiCreditSystem },
			{ id: "ai_overage", type: FeatureType.AiCreditSystem },
			{ id: "messages", type: FeatureType.Metered },
		],
	}) as unknown as AutumnContext;

const cascadeBody = {
	customer_id: "cus_123",
	feature_id: "ai_included",
	value: 4,
	properties: {
		model: "custom/internal-model",
		input_tokens: 200000,
		output_tokens: 200000,
		cascade: {
			included_feature_id: "ai_included",
			overage_feature_id: "ai_overage",
			included: { cost: 4 },
			overage: { cost: 6 },
		},
	},
};

describe("getTokenCascadeDeductionsFromBody", () => {
	test("rebuilds both cascade legs from a valid marker", () => {
		const deductions = getTokenCascadeDeductionsFromBody({
			ctx: createCtx(),
			body: cascadeBody,
		});

		expect(deductions).toHaveLength(2);
		expect(deductions?.[0]).toMatchObject({
			feature: { id: "ai_included" },
			deduction: 1,
			tokens: { cost: 4 },
			cascade: { role: "included" },
		});
		expect(deductions?.[1]).toMatchObject({
			feature: { id: "ai_overage" },
			deduction: 1,
			tokens: { cost: 6 },
			cascade: { role: "overage" },
		});
		expect(deductions?.[0].tokens?.usage).toEqual({
			modelName: "custom/internal-model",
			inputTokens: 200000,
			outputTokens: 200000,
		});
	});

	test("returns null without a cascade marker", () => {
		expect(
			getTokenCascadeDeductionsFromBody({
				ctx: createCtx(),
				body: { customer_id: "cus_123", feature_id: "ai_included", value: 4 },
			}),
		).toBeNull();
	});

	test("returns null when a referenced feature is missing or not an AI credit system", () => {
		const missingFeature = structuredClone(cascadeBody);
		missingFeature.properties.cascade.overage_feature_id = "nope";
		expect(
			getTokenCascadeDeductionsFromBody({
				ctx: createCtx(),
				body: missingFeature,
			}),
		).toBeNull();

		const wrongType = structuredClone(cascadeBody);
		wrongType.properties.cascade.included_feature_id = "messages";
		expect(
			getTokenCascadeDeductionsFromBody({ ctx: createCtx(), body: wrongType }),
		).toBeNull();
	});

	test("returns null when both roles reference the same feature", () => {
		const sameFeature = structuredClone(cascadeBody);
		sameFeature.properties.cascade.overage_feature_id = "ai_included";
		expect(
			getTokenCascadeDeductionsFromBody({
				ctx: createCtx(),
				body: sameFeature,
			}),
		).toBeNull();
	});

	test("returns null when a cost is missing or not a number", () => {
		const badCost = structuredClone(cascadeBody) as Record<string, unknown> & {
			properties: { cascade: { included: { cost: unknown } } };
		};
		badCost.properties.cascade.included.cost = "4";
		expect(
			getTokenCascadeDeductionsFromBody({
				ctx: createCtx(),
				body: badCost as typeof cascadeBody,
			}),
		).toBeNull();
	});

	test("rebuilds both legs with cost 0 for a zero-cost marker", () => {
		const zeroCost = structuredClone(cascadeBody);
		zeroCost.properties.cascade.included.cost = 0;
		zeroCost.properties.cascade.overage.cost = 0;

		const deductions = getTokenCascadeDeductionsFromBody({
			ctx: createCtx(),
			body: zeroCost,
		});

		expect(deductions).toHaveLength(2);
		expect(deductions?.[0]).toMatchObject({
			feature: { id: "ai_included" },
			tokens: { cost: 0 },
			cascade: { role: "included" },
		});
		expect(deductions?.[1]).toMatchObject({
			feature: { id: "ai_overage" },
			tokens: { cost: 0 },
			cascade: { role: "overage" },
		});
	});

	test("returns null when a cost is negative", () => {
		const negativeIncluded = structuredClone(cascadeBody);
		negativeIncluded.properties.cascade.included.cost = -1;
		expect(
			getTokenCascadeDeductionsFromBody({
				ctx: createCtx(),
				body: negativeIncluded,
			}),
		).toBeNull();

		const negativeOverage = structuredClone(cascadeBody);
		negativeOverage.properties.cascade.overage.cost = -1;
		expect(
			getTokenCascadeDeductionsFromBody({
				ctx: createCtx(),
				body: negativeOverage,
			}),
		).toBeNull();
	});

	test("queued track ignores caller-controlled cascade markers unless internally allowed", () => {
		const forgedTrackDeductions = getQueuedTrackFeatureDeductions({
			ctx: createCtx(),
			body: cascadeBody,
		});
		expect(forgedTrackDeductions).toHaveLength(1);
		expect(forgedTrackDeductions[0]).toMatchObject({
			feature: { id: "ai_included" },
			deduction: 4,
		});
		expect(forgedTrackDeductions[0].cascade).toBeUndefined();

		const internalTokenDeductions = getQueuedTrackFeatureDeductions({
			ctx: createCtx(),
			body: cascadeBody,
			allowTokenCascade: true,
		});
		expect(internalTokenDeductions).toHaveLength(2);
		expect(internalTokenDeductions[0].cascade).toEqual({ role: "included" });
		expect(internalTokenDeductions[1].cascade).toEqual({ role: "overage" });
	});

	test("queued cascade replay rebuilds only the overage remainder", () => {
		const replayDeductions = getQueuedTrackFeatureDeductions({
			ctx: createCtx(),
			body: cascadeBody,
			cascadeReplayState: {
				includedApplied: true,
				spillRemaining: 0.75,
			},
		});

		expect(replayDeductions).toHaveLength(1);
		expect(replayDeductions[0]).toMatchObject({
			feature: { id: "ai_overage" },
			deduction: 0.75,
			tokens: { cost: 6 },
		});
		expect(replayDeductions[0].cascade).toBeUndefined();
	});

	test("redis insufficient-balance conversion preserves cascade replay state", async () => {
		const replayState = { includedApplied: true, spillRemaining: 0.75 };
		const redisError = new RedisDeductionError({
			message: "Redis deduction failed: INSUFFICIENT_BALANCE",
			code: RedisDeductionErrorCode.InsufficientBalance,
			featureId: "ai_overage",
			rejectedValue: 0.75,
		});
		attachCascadeReplayState({ error: redisError, state: replayState });

		let thrown: unknown;
		try {
			await handleRedisTrackError({
				ctx: createCtx(),
				error: redisError,
				body: cascadeBody,
				featureDeductions: [],
			});
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(InsufficientBalanceError);
		expect(getCascadeReplayState(thrown)).toEqual(replayState);
	});

	test("redis V3 insufficient-balance conversion preserves cascade replay state", async () => {
		const replayState = { includedApplied: true, spillRemaining: 0.75 };
		const redisError = new RedisDeductionError({
			message: "Redis deduction failed: INSUFFICIENT_BALANCE",
			code: RedisDeductionErrorCode.InsufficientBalance,
			featureId: "ai_overage",
			rejectedValue: 0.75,
		});
		attachCascadeReplayState({ error: redisError, state: replayState });

		let thrown: unknown;
		try {
			await handleRedisTrackErrorV3({
				ctx: createCtx(),
				error: redisError,
				body: cascadeBody,
				fullSubject: {} as never,
				featureDeductions: [],
			});
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(InsufficientBalanceError);
		expect(getCascadeReplayState(thrown)).toEqual(replayState);
	});
});
