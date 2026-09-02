/**
 * Grader proofs for the fill family: each case's golden config passes every
 * catalog verdict; an empty workspace fails them all. The rollover assertions
 * are the point — a golden missing any rollover field must not pass.
 */
import { expect, test } from "bun:test";
import { addOnFlatStated } from "../../cases/fill/addOn/addOnFlatStated.eval.ts";
import { addOnPerUnitSwept } from "../../cases/fill/addOn/addOnPerUnitSwept.eval.ts";
import { rolloverStated } from "../../cases/fill/rollover/rolloverStated.eval.ts";
import { rolloverSwept } from "../../cases/fill/rollover/rolloverSwept.eval.ts";
import { scoreConfigExpectations } from "../utils/scoreConfigExpectations.ts";

test("rollover-stated: golden config passes every catalog verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: rolloverStated,
		configFile: rolloverStated.goldenConfig,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"modeled exactly 1 plans": 1,
		"has plan: pro with 50% rollover expiring in 2 months": 1,
		"has feature: credits (credit system)": 1,
	});
});

test("rollover-stated: empty workspace fails every catalog verdict", async () => {
	const scores = await scoreConfigExpectations({ axCase: rolloverStated });

	expect(scores).toEqual({
		"config parses and passes validation": 0,
		"modeled exactly 1 plans": 0,
		"has plan: pro with 50% rollover expiring in 2 months": 0,
		"has feature: credits (credit system)": 0,
	});
});

test("rollover-stated: golden WITHOUT rollover fails the plan verdict", async () => {
	const noRollover = rolloverStated.goldenConfig?.replace(
		/\t*rollover: \{[^}]*\},\n/,
		"",
	);
	expect(noRollover).not.toContain("rollover");
	const scores = await scoreConfigExpectations({
		axCase: rolloverStated,
		configFile: noRollover,
	});

	expect(scores["has plan: pro with 50% rollover expiring in 2 months"]).toBe(
		0,
	);
	expect(scores["config parses and passes validation"]).toBe(1);
});

test("rollover-swept: golden config passes every catalog verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: rolloverSwept,
		configFile: rolloverSwept.goldenConfig,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"modeled exactly 1 plans": 1,
		"has plan: pro with rollover capped at 1000 expiring in 1 month": 1,
		"has feature: credits (credit system)": 1,
	});
});

test("rollover-swept: empty workspace fails every catalog verdict", async () => {
	const scores = await scoreConfigExpectations({ axCase: rolloverSwept });

	expect(scores).toEqual({
		"config parses and passes validation": 0,
		"modeled exactly 1 plans": 0,
		"has plan: pro with rollover capped at 1000 expiring in 1 month": 0,
		"has feature: credits (credit system)": 0,
	});
});

test("add-on-per-unit-swept: golden passes, empty fails", async () => {
	const golden = await scoreConfigExpectations({
		axCase: addOnPerUnitSwept,
		configFile: addOnPerUnitSwept.goldenConfig,
	});
	expect(golden).toEqual({
		"config parses and passes validation": 1,
		"has plan: pro with 5 domains": 1,
		"has plan: domains add-on priced per unit prepaid": 1,
	});

	const empty = await scoreConfigExpectations({ axCase: addOnPerUnitSwept });
	expect(empty).toEqual({
		"config parses and passes validation": 0,
		"has plan: pro with 5 domains": 0,
		"has plan: domains add-on priced per unit prepaid": 0,
	});
});

test("add-on-per-unit-swept: flat-fee modeling fails the per-unit verdict", async () => {
	const flat = `import { feature, plan, item } from "atmn";

export const domains = feature({
	id: "domains",
	name: "Domains",
	type: "metered",
	consumable: false,
});

export const pro = plan({
	id: "pro",
	name: "Pro",
	price: { amount: 30, interval: "month" },
	items: [item({ featureId: domains.id, included: 5 })],
});

export const extraDomains = plan({
	id: "extra_domains",
	name: "Extra Domains",
	addOn: true,
	price: { amount: 10, interval: "month" },
	items: [],
});
`;
	const scores = await scoreConfigExpectations({
		axCase: addOnPerUnitSwept,
		configFile: flat,
	});

	expect(scores["has plan: domains add-on priced per unit prepaid"]).toBe(0);
	expect(scores["has plan: pro with 5 domains"]).toBe(1);
});

test("add-on-flat-stated: golden passes; per-unit modeling fails the flat verdict", async () => {
	const golden = await scoreConfigExpectations({
		axCase: addOnFlatStated,
		configFile: addOnFlatStated.goldenConfig,
	});
	expect(golden).toEqual({
		"config parses and passes validation": 1,
		"has plan: pro 1000 messages": 1,
		"has plan: sso add-on with flat base price": 1,
		"has feature: sso (boolean)": 1,
	});

	const perUnit = addOnFlatStated.goldenConfig
		?.replace(
			'\taddOn: true,\n\tprice: { amount: 50, interval: "month" },\n\titems: [item({ featureId: sso.id })],',
			`\taddOn: true,
	items: [
		item({
			featureId: sso.id,
			included: 0,
			price: {
				amount: 50,
				billingUnits: 1,
				billingMethod: "prepaid",
				interval: "month",
			},
		}),
	],`,
		)
		.replace('type: "boolean"', 'type: "metered",\n\tconsumable: false');
	const scores = await scoreConfigExpectations({
		axCase: addOnFlatStated,
		configFile: perUnit,
	});
	expect(scores["has plan: sso add-on with flat base price"]).toBe(0);
});
