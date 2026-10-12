import { expect, test } from "bun:test";
import type { Operations } from "@autumn/shared";
import {
	fixtureCatalog as catalog,
	fixtureMigrations,
} from "../preview/migrationListFixtures";
import { deriveOperationsView } from "./operationsView";

const view = (customer: unknown[], noBillingChanges: boolean | null = null) =>
	deriveOperationsView({
		operations: { customer } as Operations,
		noBillingChanges,
		catalog,
	});

const API_CALLS_TILE = { tone: "fuchsia", glyph: "battery" } as const;

test("no operations derive no view", () => {
	expect(
		deriveOperationsView({ operations: null, noBillingChanges: null, catalog }),
	).toBeNull();
});

test("a version-only update shows the target with its version and nothing inline", () => {
	expect(
		view([
			{ type: "update_plan", plan_filter: { plan_id: "starter" }, version: 2 },
		]),
	).toEqual({
		head: { label: "Starter", details: ["→ v2"] },
		inline: null,
		extraCount: 0,
		subtitle: "Update 1 plan",
		targets: { chips: [{ label: "Starter" }], moreCount: 0 },
		modifications: [
			{
				sign: "change",
				isVersion: true,
				chip: {
					label: "Version",
					tile: { tone: "purple", glyph: "gitBranch" },
					details: ["→ v2"],
				},
			},
		],
		billing: "stripe",
	});
});

test("a price change reads previous to next per interval", () => {
	const result = view([
		{
			type: "update_plan",
			plan_filter: { plan_id: "starter" },
			customize: {
				price: { amount: 49, interval: "month" },
				previous_price: { amount: 39, interval: "month" },
			},
		},
	]);
	expect(result?.inline).toEqual({
		label: "Base price",
		details: ["$39 → $49/mo"],
	});
	expect(result?.modifications[0].chip.tile).toEqual({
		tone: "amber",
		glyph: "currencyCircleDollar",
	});
});

test("added and removed items use the feature's tile", () => {
	const result = view([
		{
			type: "update_plan",
			plan_filter: { plan_id: "pro" },
			customize: {
				add_items: [
					{
						feature_id: "api_calls",
						included: 10_000,
						reset: { interval: "month" },
					},
					{ feature_id: "seats", included: 5 },
				],
				remove_items: [{ feature_id: "sso" }],
			},
		},
	]);
	expect(result?.modifications).toEqual([
		{
			sign: "add",
			chip: {
				label: "API calls",
				tile: API_CALLS_TILE,
				details: ["+ 10,000/mo"],
			},
		},
		{
			sign: "add",
			chip: {
				label: "Seats",
				tile: { tone: "blue", glyph: "ticket" },
				details: ["+ 5 included"],
			},
		},
		{
			sign: "remove",
			chip: {
				label: "SSO",
				tile: { tone: "red", glyph: "toggle" },
				details: ["removed"],
			},
		},
	]);
	expect(result?.extraCount).toBe(2);
});

test("deprecated item updates and feature-less removals still name their target", () => {
	expect(
		view([
			{
				type: "update_plan",
				plan_filter: { plan_id: "pro" },
				customize: {
					update_items: [{ filter: { feature_id: "seats" }, included: 10 }],
					remove_items: [{ billing_method: "usage_based", interval: "month" }],
				},
			},
		])?.modifications.map(({ sign, chip }) => ({
			sign,
			label: chip.label,
			details: chip.details,
		})),
	).toEqual([
		{ sign: "change", label: "Seats", details: ["→ 10 included"] },
		{
			sign: "remove",
			label: "Usage-based items · month",
			details: ["removed"],
		},
	]);
});

test("a feature-less removal names its interval count and included amount", () => {
	expect(
		view([
			{
				type: "update_plan",
				plan_filter: { plan_id: "pro" },
				customize: {
					remove_items: [
						{
							billing_method: "usage_based",
							interval: "month",
							interval_count: 3,
							included: 500,
						},
					],
				},
			},
		])?.modifications.map(({ chip }) => chip.label),
	).toEqual(["Usage-based items · 3 months · 500 included"]);
});

test("a customized license shows as a blue ticket chip", () => {
	expect(
		view([
			{
				type: "update_plan",
				plan_filter: { plan_id: "enterprise" },
				customize: { upsert_licenses: [{ license_plan_id: "seat_license" }] },
			},
		])?.modifications,
	).toEqual([
		{
			sign: "change",
			chip: {
				label: "Seat license",
				tile: { tone: "blue", glyph: "ticket" },
				details: ["customized"],
			},
		},
	]);
});

test("an add plan alone leads with the new plan and is not repeated inline", () => {
	expect(view([{ type: "add_plan", plan_id: "hobby" }], true)).toEqual({
		head: { label: "Hobby", details: ["new plan"] },
		inline: null,
		extraCount: 0,
		subtitle: "Add plan Hobby",
		targets: { chips: [], moreCount: 0 },
		modifications: [
			{
				sign: "add",
				chip: {
					label: "Hobby",
					tile: { tone: "green", glyph: "plusCircle" },
					details: ["new plan"],
				},
			},
		],
		billing: "autumn",
	});
});

test("multiple operations keep the version out of the inline slot and count the rest", () => {
	const result = view([
		{
			type: "update_plan",
			plan_filter: { plan_id: "pro" },
			version: 3,
			customize: {
				price: { amount: 129, interval: "month" },
				previous_price: { amount: 99, interval: "month" },
				add_items: [
					{
						feature_id: "api_calls",
						included: 10_000,
						reset: { interval: "month" },
					},
				],
				remove_items: [{ feature_id: "sso" }],
			},
		},
		{ type: "add_plan", plan_id: "analytics_addon" },
	]);
	expect(result?.head).toEqual({ label: "Pro", details: ["→ v3"] });
	expect(result?.inline?.details).toEqual(["$99 → $129/mo"]);
	expect(result?.extraCount).toBe(3);
	expect(
		result?.modifications.map((modification) => modification.sign),
	).toEqual(["change", "change", "add", "remove", "add"]);
});

test("updating several plans counts them and lists each as a chip", () => {
	const result = view([
		{
			type: "update_plan",
			plan_filter: { plan_id: { $in: ["team", "business"] } },
			customize: { add_items: [{ feature_id: "seats", included: 5 }] },
		},
	]);
	expect(result?.subtitle).toBe("Update 2 plans");
	expect(result?.targets).toEqual({
		chips: [{ label: "Team" }, { label: "Business" }],
		moreCount: 0,
	});
});

const planVariantsOperations = () => {
	const fixture = fixtureMigrations.find(
		(candidate) => candidate.id === "migration-plan-variants",
	);
	if (!fixture?.operations) throw new Error("plan variants fixture missing");
	return deriveOperationsView({
		operations: fixture.operations,
		noBillingChanges: fixture.no_billing_changes,
		catalog,
	});
};

test("an added boolean feature shows its name with no amount", () => {
	const narration = planVariantsOperations()?.modifications.find(
		({ chip }) => chip.label === "Narration",
	);
	expect(narration?.chip.details).toBeUndefined();
});

test("a boolean update shows no included amount", () => {
	expect(
		view([
			{
				type: "update_plan",
				plan_filter: { plan_id: "pro" },
				customize: {
					update_items: [{ filter: { feature_id: "sso" }, included: 0 }],
				},
			},
		])?.modifications.map(({ chip }) => chip.details),
	).toEqual([["updated"]]);
});

test("an added item with nothing included never reads + 0", () => {
	const credits = planVariantsOperations()?.modifications.find(
		({ chip }) => chip.label === "Credits",
	);
	expect(credits?.chip.details).toEqual(["added"]);
});

test("an added paid item shows its price after any included amount", () => {
	const detailsFor = (item: Record<string, unknown>) =>
		view([
			{
				type: "update_plan",
				plan_filter: { plan_id: "pro" },
				customize: { add_items: [item] },
			},
		])?.modifications.map(({ chip }) => chip.details);

	expect(
		detailsFor({
			feature_id: "credits",
			included: 0,
			price: {
				amount: 10,
				billing_units: 1000,
				interval: "one_off",
				billing_method: "prepaid",
			},
		}),
	).toEqual([["$10 per 1,000 one-off"]]);
	expect(
		detailsFor({
			feature_id: "credits",
			included: 500,
			reset: { interval: "month" },
			price: { amount: 1, interval: "month", billing_method: "usage_based" },
		}),
	).toEqual([["+ 500/mo · $1/mo"]]);
});

test("every reset interval reads with a separator", () => {
	const detailFor = (interval: string) =>
		view([
			{
				type: "update_plan",
				plan_filter: { plan_id: "pro" },
				customize: {
					add_items: [
						{ feature_id: "api_calls", included: 5, reset: { interval } },
					],
				},
			},
		])?.modifications[0].chip.details?.[0];
	expect(
		[
			"one_off",
			"minute",
			"hour",
			"day",
			"week",
			"month",
			"quarter",
			"semi_annual",
			"year",
		].map(detailFor),
	).toEqual([
		"+ 5 one-off",
		"+ 5 / minute",
		"+ 5 / hour",
		"+ 5/day",
		"+ 5/wk",
		"+ 5/mo",
		"+ 5/qtr",
		"+ 5 / half year",
		"+ 5/yr",
	]);
});

test("ten target plans become a count subtitle over a capped chip list", () => {
	const result = planVariantsOperations();
	expect(result?.subtitle).toBe("Update 10 plans");
	expect(result?.targets).toEqual({
		chips: [
			{ label: "Hobby" },
			{ label: "Hobby (10k credits/month)" },
			{ label: "Hobby (25k credits/month)" },
		],
		moreCount: 7,
	});
});
