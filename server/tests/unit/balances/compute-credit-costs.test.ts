import { describe, expect, test } from "bun:test";
import {
	type CreditSchemaItem,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import { computeCreditCosts } from "@/internal/balances/utils/deduction/computeCreditCosts.js";
import type { FeatureDeduction } from "@/internal/balances/utils/types/featureDeduction.js";

const makeFeature = (
	id: string,
	type: FeatureType,
	schema: CreditSchemaItem[] = [],
): Feature => ({
	internal_id: `fe_${id}`,
	org_id: "org_test",
	created_at: 0,
	env: "sandbox" as Feature["env"],
	id,
	name: id,
	type,
	config: { schema, usage_type: FeatureUsageType.Single },
	archived: false,
	event_names: [],
	model_markups: null,
});

const makeCusEnt = (id: string, feature: Feature) =>
	({ id, entitlement: { feature } }) as FullCusEntWithFullCusProduct;

const messages = makeFeature("messages", FeatureType.Metered);
const credits = makeFeature("credits", FeatureType.CreditSystem, [
	{ metered_feature_id: "messages", credit_amount: 0.2 },
]);
// Simulates a stale cached snapshot whose schema no longer includes "messages".
const staleCredits = makeFeature("credits", FeatureType.CreditSystem, [
	{ metered_feature_id: "other_feature", credit_amount: 5 },
]);
const currentInvoiceCredits = {
	...credits,
	config: { ...credits.config, invoice_credit: true },
} as Feature;
const graduatedCredits = makeFeature("credits", FeatureType.CreditSystem, [
	{
		metered_feature_id: "messages",
		tier_behavior: "graduated",
		tiers: [{ to: "inf", credit_amount: 0.5 }],
	},
]);

describe("computeCreditCosts", () => {
	test("applies schema ratios for parent credit systems", () => {
		const deduction: FeatureDeduction = { feature: messages, deduction: 10 };
		const lookup = computeCreditCosts({
			cusEnts: [makeCusEnt("ce_msg", messages), makeCusEnt("ce_cred", credits)],
			deduction,
		});

		expect(lookup("ce_msg")).toEqual({ creditCost: 1 });
		expect(lookup("ce_cred")).toEqual({ creditCost: 0.2 });
	});

	test("token deductions use their USD cost 1:1 and ratio-map to parents", () => {
		const aiCredits = makeFeature("ai_credits", FeatureType.AiCreditSystem);
		const orbs = makeFeature("orbs", FeatureType.CreditSystem, [
			{ metered_feature_id: "ai_credits", credit_amount: 1000 },
		]);
		const deduction: FeatureDeduction = {
			feature: aiCredits,
			deduction: 1,
			tokens: {
				usage: { modelName: "custom/m", inputTokens: 1, outputTokens: 1 },
				cost: 0.125,
			},
		};
		const lookup = computeCreditCosts({
			cusEnts: [makeCusEnt("ce_ai", aiCredits), makeCusEnt("ce_orbs", orbs)],
			deduction,
		});

		expect(lookup("ce_ai")).toEqual({ creditCost: 0.125 });
		expect(lookup("ce_orbs")).toEqual({ creditCost: 125 });
	});

	test("stale schema snapshot falls back to 1 instead of failing the track", () => {
		const deduction: FeatureDeduction = { feature: messages, deduction: 10 };
		const lookup = computeCreditCosts({
			cusEnts: [makeCusEnt("ce_stale", staleCredits)],
			deduction,
		});

		expect(lookup("ce_stale")).toEqual({ creditCost: 1 });
	});

	test("rejects a stale cached schema for an invoice credit rate card", () => {
		const deduction: FeatureDeduction = { feature: messages, deduction: 10 };

		expect(() =>
			computeCreditCosts({
				cusEnts: [makeCusEnt("ce_stale", staleCredits)],
				deduction,
				catalogFeatures: [messages, currentInvoiceCredits],
			}),
		).toThrow(/stale credit rate card/i);
	});

	test("passes graduated cards to the atomic deduction engine", () => {
		const deduction: FeatureDeduction = { feature: messages, deduction: 10 };
		const lookup = computeCreditCosts({
			cusEnts: [makeCusEnt("ce_graduated", graduatedCredits)],
			deduction,
		});

		expect(lookup("ce_graduated")).toEqual({
			creditCost: 0.5,
			rateCard: {
				source_internal_feature_id: messages.internal_id,
				feature_amount: 1,
				tier_behavior: "graduated",
				tiers: [{ to: "inf", credit_amount: 0.5 }],
			},
		});
	});

	test("rejects graduated cards backed by an unlimited credit entitlement", () => {
		const deduction: FeatureDeduction = { feature: messages, deduction: 10 };
		const unlimitedEntitlement = {
			...makeCusEnt("ce_graduated", graduatedCredits),
			unlimited: true,
		} as FullCusEntWithFullCusProduct;

		expect(() =>
			computeCreditCosts({
				cusEnts: [unlimitedEntitlement],
				deduction,
			}),
		).toThrow(/graduated credit rate cards.*unlimited/i);
	});

	test("rejects graduated cards backed by additional balances", () => {
		const deduction: FeatureDeduction = { feature: messages, deduction: 10 };
		const customerAdditionalBalance = {
			...makeCusEnt("ce_customer_additional", graduatedCredits),
			additional_balance: 1,
		} as FullCusEntWithFullCusProduct;
		const entityAdditionalBalance = {
			...makeCusEnt("ce_entity_additional", graduatedCredits),
			entities: {
				entity_1: {
					id: "entity_1",
					balance: 100,
					adjustment: 0,
					additional_balance: 1,
				},
			},
		} as FullCusEntWithFullCusProduct;

		for (const customerEntitlement of [
			customerAdditionalBalance,
			entityAdditionalBalance,
		]) {
			expect(() =>
				computeCreditCosts({
					cusEnts: [customerEntitlement],
					deduction,
				}),
			).toThrow(/graduated credit rate cards.*additional balances/i);
		}
	});
});
