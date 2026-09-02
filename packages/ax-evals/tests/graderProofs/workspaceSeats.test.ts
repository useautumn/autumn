/**
 * Grader proofs for the workspace-seats suite: the shared golden passes
 * every config verdict; an empty workspace fails them all. Mutation proofs
 * pin the license signatures: per-unit seats instead of a license plan,
 * prepaid packs moved onto the seat plan, and a second seat plan minted for
 * starter must each go red.
 */
import { expect, test } from "bun:test";
import { askSeatGrants } from "../../cases/suites/workspaceSeats/askSeatGrants.eval.ts";
import { clearSeatGrants } from "../../cases/suites/workspaceSeats/clearSeatGrants.eval.ts";
import { oneShot } from "../../cases/suites/workspaceSeats/oneShot.eval.ts";
import { seedStarterReuse } from "../../cases/suites/workspaceSeats/seedStarterReuse.eval.ts";
import { workspaceSeatsConfig } from "../../cases/suites/workspaceSeats/workspaceSeatsPricing.ts";
import { scoreConfigExpectations } from "../utils/scoreConfigExpectations.ts";

test("one-shot: golden config passes every config verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: oneShot,
		configFile: oneShot.goldenConfig,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"has plan: workspace plan: $10/mo granting 1000 credits": 1,
		"has plan: team: 10 workspaces included, shared prepaid $20/20k": 1,
		"has plan: starter: free, 1 workspace included, prepaid $60/20k": 1,
		"has plan: team annual variant": 1,
		"has feature: credits (credit system)": 1,
		"exactly one license plan, reused across plans": 1,
	});
});

test("one-shot: empty workspace fails every config verdict", async () => {
	const scores = await scoreConfigExpectations({ axCase: oneShot });

	expect(scores).toEqual({
		"config parses and passes validation": 0,
		"has plan: workspace plan: $10/mo granting 1000 credits": 0,
		"has plan: team: 10 workspaces included, shared prepaid $20/20k": 0,
		"has plan: starter: free, 1 workspace included, prepaid $60/20k": 0,
		"has plan: team annual variant": 0,
		"has feature: credits (credit system)": 0,
		"exactly one license plan, reused across plans": 0,
	});
});

test("one-shot: per-unit seats instead of a license plan fails the license verdicts", async () => {
	const perUnitSeats = `import { feature, plan, item } from "atmn";

export const actionCalls = feature({
	id: "action_calls",
	name: "Action Calls",
	type: "metered",
	consumable: true,
});

export const credits = feature({
	id: "credits",
	name: "Credits",
	type: "credit_system",
	creditSchema: [{ meteredFeatureId: "action_calls", creditCost: 1 }],
});

export const seats = feature({
	id: "seats",
	name: "Seats",
	type: "metered",
	consumable: false,
});

export const team = plan({
	id: "team",
	name: "Team",
	price: { amount: 600, interval: "month" },
	items: [
		item({
			featureId: seats.id,
			included: 10,
			price: {
				amount: 10,
				billingUnits: 1,
				billingMethod: "prepaid",
				interval: "month",
			},
		}),
		item({
			featureId: credits.id,
			included: 10000,
			reset: { interval: "month" },
		}),
		item({
			featureId: credits.id,
			included: 0,
			price: {
				amount: 20,
				billingUnits: 20000,
				billingMethod: "prepaid",
				interval: "month",
			},
		}),
	],
});
`;
	const scores = await scoreConfigExpectations({
		axCase: oneShot,
		configFile: perUnitSeats,
	});

	expect(scores["exactly one license plan, reused across plans"]).toBe(0);
	expect(scores["has plan: workspace plan: $10/mo granting 1000 credits"]).toBe(
		0,
	);
});

test("seed-starter-reuse: golden passes every config verdict", async () => {
	const scores = await scoreConfigExpectations({
		axCase: seedStarterReuse,
		configFile: seedStarterReuse.goldenConfig,
	});

	expect(scores).toEqual({
		"config parses and passes validation": 1,
		"has plan: existing workspace plan untouched": 1,
		"has plan: existing team untouched": 1,
		"has plan: starter: free, 1 workspace included, prepaid $60/20k": 1,
		"modeled exactly 5 plans": 1,
		"exactly one license plan, reused across plans": 1,
	});
});

test("seed-starter-reuse: the seeded config alone fails the starter verdicts", async () => {
	const scores = await scoreConfigExpectations({
		axCase: seedStarterReuse,
		configFile: seedStarterReuse.existingFiles?.["autumn.config.ts"],
	});

	expect(
		scores["has plan: starter: free, 1 workspace included, prepaid $60/20k"],
	).toBe(0);
	expect(scores["modeled exactly 5 plans"]).toBe(0);
	expect(scores["has plan: existing team untouched"]).toBe(1);
});

test("seed-starter-reuse: minting a second seat plan fails the one-license verdict", async () => {
	const secondSeatPlan = `${workspaceSeatsConfig({ withStarter: false })}
export const starterSeat = plan({
	id: "starter_seat",
	name: "Starter Seat",
	price: { amount: 10, interval: "month" },
	items: [
		item({
			featureId: credits.id,
			included: 1000,
			reset: { interval: "month" },
		}),
	],
});

export const starter = plan({
	id: "starter",
	name: "Starter",
	items: [
		item({
			featureId: credits.id,
			included: 0,
			price: {
				amount: 60,
				billingUnits: 20000,
				billingMethod: "prepaid",
				interval: "month",
			},
		}),
	],
	licenses: [
		{
			licensePlanId: "starter_seat",
			included: 1,
			customize: {
				price: { amount: 15, interval: "month" },
				addItems: [
					item({
						featureId: credits.id,
						included: 500,
						reset: { interval: "month" },
					}),
				],
				removeItems: [{ featureId: credits.id }],
			},
		},
	],
});
`;
	const scores = await scoreConfigExpectations({
		axCase: seedStarterReuse,
		configFile: secondSeatPlan,
	});

	expect(scores["exactly one license plan, reused across plans"]).toBe(0);
	expect(
		scores["has plan: starter: free, 1 workspace included, prepaid $60/20k"],
	).toBe(1);
});

test("ask/clear seat-grants: golden passes both cases' config verdicts", async () => {
	for (const axCase of [askSeatGrants, clearSeatGrants]) {
		const scores = await scoreConfigExpectations({
			axCase,
			configFile: axCase.goldenConfig,
		});
		for (const [name, score] of Object.entries(scores)) {
			expect({ name, score }).toEqual({ name, score: 1 });
		}
	}
});
