/**
 * Grader proofs for the messaging-api suite: the shared golden passes every
 * config verdict; an empty workspace fails them all. Mutation proofs pin the
 * suite's signatures: merged groups fail planGroups, standalone tier plans
 * fail the variant check, per-unit-priced-as-flat fails the spec anchors.
 */
import { expect, test } from "bun:test";
import { askBothLines } from "../../cases/suites/messagingApi/askBothLines.eval.ts";
import { clearBothLines } from "../../cases/suites/messagingApi/clearBothLines.eval.ts";
import { messagingApiConfig } from "../../cases/suites/messagingApi/messagingApiPricing.ts";
import { oneShot } from "../../cases/suites/messagingApi/oneShot.eval.ts";
import { seedScaleOverage } from "../../cases/suites/messagingApi/seedScaleOverage.eval.ts";
import { seedTierVariants } from "../../cases/suites/messagingApi/seedTierVariants.eval.ts";
import { scoreConfigExpectations } from "../utils/scoreConfigExpectations.ts";

test("one-shot: golden config passes every config verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: oneShot,
		configFile: oneShot.goldenConfig,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"has plan: api free 3000 messages": 1,
		"has plan: api pro with per-1k overage": 1,
		"has plan: campaigns pro 5000 contacts": 1,
		"has plan: sso flat add-on": 1,
		"has feature: messages (metered)": 1,
		"modeled exactly 5 plans": 1,
		"plans form 2 groups, each with a free default": 1,
	});
});

test("one-shot: empty workspace fails every config verdict", async () => {
	const scores = await scoreConfigExpectations({ axCase: oneShot });

	expect(scores).toEqual({
		"config parses and passes validation": 0,
		"has plan: api free 3000 messages": 0,
		"has plan: api pro with per-1k overage": 0,
		"has plan: campaigns pro 5000 contacts": 0,
		"has plan: sso flat add-on": 0,
		"has feature: messages (metered)": 0,
		"modeled exactly 5 plans": 0,
		"plans form 2 groups, each with a free default": 0,
	});
});

test("one-shot: groups stripped (one merged lineup) fails the groups verdict", async () => {
	const merged = messagingApiConfig().replaceAll(/\tgroup: "[a-z]+",\n/g, "");
	expect(merged).not.toContain("group:");
	const scores = await scoreConfigExpectations({
		axCase: oneShot,
		configFile: merged,
	});

	expect(scores["plans form 2 groups, each with a free default"]).toBe(0);
	expect(scores["config parses and passes validation"]).toBe(1);
});

test("ask/clear both-lines: golden passes both cases' config verdicts", async () => {
	for (const axCase of [askBothLines, clearBothLines]) {
		const scores = await scoreConfigExpectations({
			axCase,
			configFile: axCase.goldenConfig,
		});
		expect(scores).toEqual({
			"config parses and passes validation": 1,
			"has plan: api pro with per-1k overage": 1,
			"has plan: campaigns pro 5000 contacts": 1,
			"plans form 2 groups, each with a free default": 1,
		});
	}
});

test("seed-tier-variants: golden (with .variant() siblings) passes every verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: seedTierVariants,
		configFile: seedTierVariants.goldenConfig,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"has plan: existing api pro untouched": 1,
		"has plan: api pro 100k sibling": 1,
		"has plan: api pro 200k sibling": 1,
		"has plan: campaigns pro 25k sibling": 1,
		"has plan: campaigns pro 100k sibling": 1,
		"modeled exactly 9 plans": 1,
		"at least 4 plans defined as variants": 1,
		"base plans carry no prepaid items": 1,
	});
});

test("seed-tier-variants: the seeded config alone fails the sibling verdicts", async () => {
	const scores = await scoreConfigExpectations({
		axCase: seedTierVariants,
		configFile: seedTierVariants.existingFiles?.["autumn.config.ts"],
	});

	expect(scores["has plan: api pro 100k sibling"]).toBe(0);
	expect(scores["has plan: campaigns pro 25k sibling"]).toBe(0);
	expect(scores["modeled exactly 9 plans"]).toBe(0);
	expect(scores["at least 4 plans defined as variants"]).toBe(0);
	expect(scores["has plan: existing api pro untouched"]).toBe(1);
});

test("seed-scale-overage: golden (base + variants with per-tier overage) passes every verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: seedScaleOverage,
		configFile: seedScaleOverage.goldenConfig,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"has plan: scale 500k with $0.70 per 1k overage": 1,
		"has plan: scale 1m with $0.65 per 1k overage": 1,
		"has plan: scale 2m with $0.55 per 1k overage": 1,
		"modeled exactly 8 plans": 1,
		"base plans carry no prepaid items": 1,
	});
});

test("seed-scale-overage: one shared overage rate fails the per-tier verdicts", async () => {
	const sharedRate = seedScaleOverage.goldenConfig
		?.replaceAll("amount: 0.65,", "amount: 0.7,")
		.replaceAll("amount: 0.55,", "amount: 0.7,");
	const scores = await scoreConfigExpectations({
		axCase: seedScaleOverage,
		configFile: sharedRate,
	});

	expect(scores["has plan: scale 500k with $0.70 per 1k overage"]).toBe(1);
	expect(scores["has plan: scale 1m with $0.65 per 1k overage"]).toBe(0);
	expect(scores["has plan: scale 2m with $0.55 per 1k overage"]).toBe(0);
});

test("seed-scale-overage: the seeded config alone fails the scale verdicts", async () => {
	const scores = await scoreConfigExpectations({
		axCase: seedScaleOverage,
		configFile: seedScaleOverage.existingFiles?.["autumn.config.ts"],
	});

	expect(scores["has plan: scale 500k with $0.70 per 1k overage"]).toBe(0);
	expect(scores["modeled exactly 8 plans"]).toBe(0);
});

test("seed-tier-variants: siblings as standalone plan() fail the variant verdict", async () => {
	const standalone = `${messagingApiConfig()}
export const apiPro100k = plan({
	id: "api_pro_100k",
	name: "API Pro 100K",
	group: "api",
	price: { amount: 45, interval: "month" },
	items: [
		item({
			featureId: messages.id,
			included: 100000,
			reset: { interval: "month" },
			price: messageOverage,
		}),
	],
});

export const apiPro200k = plan({
	id: "api_pro_200k",
	name: "API Pro 200K",
	group: "api",
	price: { amount: 80, interval: "month" },
	items: [
		item({
			featureId: messages.id,
			included: 200000,
			reset: { interval: "month" },
			price: messageOverage,
		}),
	],
});

export const campaignsPro25k = plan({
	id: "campaigns_pro_25k",
	name: "Campaigns Pro 25K",
	group: "campaigns",
	price: { amount: 150, interval: "month" },
	items: [item({ featureId: contacts.id, included: 25000 })],
});

export const campaignsPro100k = plan({
	id: "campaigns_pro_100k",
	name: "Campaigns Pro 100K",
	group: "campaigns",
	price: { amount: 400, interval: "month" },
	items: [item({ featureId: contacts.id, included: 100000 })],
});
`;
	const scores = await scoreConfigExpectations({
		axCase: seedTierVariants,
		configFile: standalone,
	});

	expect(scores["at least 4 plans defined as variants"]).toBe(0);
	expect(scores["has plan: api pro 100k sibling"]).toBe(1);
	expect(scores["has plan: campaigns pro 25k sibling"]).toBe(1);
	expect(scores["modeled exactly 9 plans"]).toBe(1);
});
