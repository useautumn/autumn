/**
 * Grader proofs for the fill family: each case's golden config passes every
 * catalog verdict; an empty workspace fails them all. The rollover assertions
 * are the point — a golden missing any rollover field must not pass.
 */
import { expect, test } from "bun:test";
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
