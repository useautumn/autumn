import { describe, expect, test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getQueuedTrackFeatureDeductions } from "@/internal/balances/track/runQueuedTrack.js";
import { getTokenCascadeDeductionsFromBody } from "@/internal/balances/track/utils/getFeatureDeductions.js";

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
	test("rebuilds one deduction with overage as spillover", () => {
		const deductions = getTokenCascadeDeductionsFromBody({
			ctx: createCtx(),
			body: cascadeBody,
		});

		expect(deductions).toHaveLength(1);
		expect(deductions?.[0]).toMatchObject({
			feature: { id: "ai_included" },
			deduction: 1,
			tokens: { cost: 4 },
			spillover: [{ feature: { id: "ai_overage" }, tokens: { cost: 6 } }],
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

	test("rebuilds with cost 0 for a zero-cost marker", () => {
		const zeroCost = structuredClone(cascadeBody);
		zeroCost.properties.cascade.included.cost = 0;
		zeroCost.properties.cascade.overage.cost = 0;

		const deductions = getTokenCascadeDeductionsFromBody({
			ctx: createCtx(),
			body: zeroCost,
		});

		expect(deductions).toHaveLength(1);
		expect(deductions?.[0]).toMatchObject({
			feature: { id: "ai_included" },
			tokens: { cost: 0 },
			spillover: [{ feature: { id: "ai_overage" }, tokens: { cost: 0 } }],
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
		expect(forgedTrackDeductions[0].spillover).toBeUndefined();

		const internalTokenDeductions = getQueuedTrackFeatureDeductions({
			ctx: createCtx(),
			body: cascadeBody,
			allowTokenCascade: true,
		});
		expect(internalTokenDeductions).toHaveLength(1);
		expect(internalTokenDeductions[0]).toMatchObject({
			feature: { id: "ai_included" },
			tokens: { cost: 4 },
			spillover: [{ feature: { id: "ai_overage" }, tokens: { cost: 6 } }],
		});
	});
});
