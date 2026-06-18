import { describe, expect, test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getQueuedTrackFeatureDeductions } from "@/internal/balances/track/runQueuedTrack.js";
import { getTokenCascadeDeductionsFromBody } from "@/internal/balances/track/utils/getFeatureDeductions.js";
import {
	buildTokenCascadeDeduction,
	sortCusEntsForTokenCascade,
} from "@/internal/balances/utils/types/featureDeduction.js";

const createCtx = (): AutumnContext =>
	({
		features: [
			{ id: "ai_included", type: FeatureType.AiCreditSystem },
			{ id: "ai_included_2", type: FeatureType.AiCreditSystem },
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
			systems: [
				{ feature_id: "ai_included", cost: 4 },
				{ feature_id: "ai_overage", cost: 6 },
			],
		},
	},
};

describe("getTokenCascadeDeductionsFromBody", () => {
	test("rebuilds one deduction with the overage system as spillover", () => {
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

	test("rebuilds three systems, preserving included-first order as spillover", () => {
		const threeSystemBody = structuredClone(cascadeBody);
		threeSystemBody.properties.cascade.systems = [
			{ feature_id: "ai_included", cost: 4 },
			{ feature_id: "ai_included_2", cost: 5 },
			{ feature_id: "ai_overage", cost: 6 },
		];

		const deductions = getTokenCascadeDeductionsFromBody({
			ctx: createCtx(),
			body: threeSystemBody,
		});

		expect(deductions).toHaveLength(1);
		expect(deductions?.[0]).toMatchObject({
			feature: { id: "ai_included" },
			deduction: 1,
			tokens: { cost: 4 },
			spillover: [
				{ feature: { id: "ai_included_2" }, tokens: { cost: 5 } },
				{ feature: { id: "ai_overage" }, tokens: { cost: 6 } },
			],
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

	test("returns null with fewer than two systems", () => {
		const singleSystem = structuredClone(cascadeBody);
		singleSystem.properties.cascade.systems = [
			{ feature_id: "ai_included", cost: 4 },
		];
		expect(
			getTokenCascadeDeductionsFromBody({
				ctx: createCtx(),
				body: singleSystem,
			}),
		).toBeNull();
	});

	test("returns null when a referenced feature is missing or not an AI credit system", () => {
		const missingFeature = structuredClone(cascadeBody);
		missingFeature.properties.cascade.systems[1].feature_id = "nope";
		expect(
			getTokenCascadeDeductionsFromBody({
				ctx: createCtx(),
				body: missingFeature,
			}),
		).toBeNull();

		const wrongType = structuredClone(cascadeBody);
		wrongType.properties.cascade.systems[0].feature_id = "messages";
		expect(
			getTokenCascadeDeductionsFromBody({ ctx: createCtx(), body: wrongType }),
		).toBeNull();
	});

	test("returns null when two systems reference the same feature", () => {
		const sameFeature = structuredClone(cascadeBody);
		sameFeature.properties.cascade.systems[1].feature_id = "ai_included";
		expect(
			getTokenCascadeDeductionsFromBody({
				ctx: createCtx(),
				body: sameFeature,
			}),
		).toBeNull();
	});

	test("returns null when a cost is missing or not a number", () => {
		const badCost = structuredClone(cascadeBody) as Record<string, unknown> & {
			properties: { cascade: { systems: Array<{ cost: unknown }> } };
		};
		badCost.properties.cascade.systems[0].cost = "4";
		expect(
			getTokenCascadeDeductionsFromBody({
				ctx: createCtx(),
				body: badCost as typeof cascadeBody,
			}),
		).toBeNull();
	});

	test("rebuilds with cost 0 for a zero-cost marker", () => {
		const zeroCost = structuredClone(cascadeBody);
		zeroCost.properties.cascade.systems[0].cost = 0;
		zeroCost.properties.cascade.systems[1].cost = 0;

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
		negativeIncluded.properties.cascade.systems[0].cost = -1;
		expect(
			getTokenCascadeDeductionsFromBody({
				ctx: createCtx(),
				body: negativeIncluded,
			}),
		).toBeNull();

		const negativeOverage = structuredClone(cascadeBody);
		negativeOverage.properties.cascade.systems[1].cost = -1;
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

	test("orders prepared entitlements by cascade system order", () => {
		const ctx = createCtx();
		const included = ctx.features[0];
		const overage = ctx.features[2];
		const deduction = buildTokenCascadeDeduction({
			systems: [
				{ feature: included, cost: 4 },
				{ feature: overage, cost: 6 },
			],
			tokenUsage: {
				modelName: "custom/internal-model",
				inputTokens: 200000,
				outputTokens: 200000,
			},
		});
		const cusEnts = [
			{ id: "ce_overage", entitlement: { feature: overage } },
			{ id: "ce_included", entitlement: { feature: included } },
		];

		sortCusEntsForTokenCascade(cusEnts, deduction);

		expect(cusEnts.map((cusEnt) => cusEnt.id)).toEqual([
			"ce_included",
			"ce_overage",
		]);
	});
});
