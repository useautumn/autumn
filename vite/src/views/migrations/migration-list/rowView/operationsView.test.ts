import { expect, test } from "bun:test";
import type { Operations } from "@autumn/shared";
import { fixtureCatalog as catalog } from "../preview/migrationListFixtures";
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
		subtitle: "Update plan Starter",
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

test("updating several plans names every target in the subtitle", () => {
	expect(
		view([
			{
				type: "update_plan",
				plan_filter: { plan_id: { $in: ["team", "business"] } },
				customize: { add_items: [{ feature_id: "seats", included: 5 }] },
			},
		])?.subtitle,
	).toBe("Update plans Team, Business");
});
