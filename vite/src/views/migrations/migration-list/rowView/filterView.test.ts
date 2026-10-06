import { expect, test } from "bun:test";
import type { MigrationFilter } from "@autumn/shared";
import {
	fixtureCatalog as catalog,
	TEN_PLAN_VARIANTS,
} from "../preview/migrationListFixtures";
import { deriveFilterView } from "./filterView";

const view = (filter: MigrationFilter | null) =>
	deriveFilterView({ filter, catalog });

test("no filter derives no view", () => {
	expect(view(null)).toBeNull();
	expect(view({ customer: {} })).toBeNull();
});

test("a single plan is a plain chip with no extras", () => {
	expect(view({ customer: { plan: { plan_id: "starter" } } })).toEqual({
		head: { label: "Starter" },
		extraCount: 0,
		groups: [
			[
				{
					label: "Where plan is",
					chips: [{ label: "Starter" }],
					moreCount: 0,
				},
			],
		],
	});
});

test("versions fold into one chip per plan, the cell drops them and counts extra plans", () => {
	const result = view({
		customer: {
			plan: {
				$or: [
					{ plan_id: "pro", version: 2 },
					{ plan_id: "pro", version: 1 },
					{ plan_id: "pro_annual", version: 1 },
				],
			},
		},
	});
	expect(result?.head).toEqual({ label: "Pro" });
	expect(result?.extraCount).toBe(1);
	expect(result?.groups[0][0]).toEqual({
		label: "Where plan in",
		chips: [
			{ label: "Pro", details: ["v1, v2"] },
			{ label: "Pro Annual", details: ["v1"] },
		],
		moreCount: 0,
	});
});

test("a negated plan carries a muted not prefix", () => {
	const result = view({ customer: { plan: { $none: { plan_id: "pro" } } } });
	expect(result?.head).toEqual({ label: "Pro", prefix: "not" });
	expect(result?.groups[0][0].label).toBe("Where plan is not");
});

test("has no plan is a plain cell chip and a neutral prohibit tile on hover", () => {
	const result = view({ customer: { plan: { $none: {} } } });
	expect(result?.head).toEqual({ label: "No plan" });
	expect(result?.groups[0]).toEqual([
		{
			label: "Where plan",
			chips: [
				{ label: "No plan", tile: { tone: "neutral", glyph: "prohibit" } },
			],
			moreCount: 0,
		},
	]);
});

test("customer in and not in become person chips, exclusions sort last", () => {
	expect(
		view({ customer: { customer_id: { $in: ["cus_a", "cus_b", "cus_c"] } } })
			?.head,
	).toEqual({ label: "3 customers" });

	const excluded = view({
		customer: {
			customer_id: { $nin: ["cus_a", "cus_b"] },
			plan: { plan_id: "starter" },
		},
	});
	expect(excluded?.head.label).toBe("Starter");
	expect(
		view({ customer: { customer_id: { $nin: ["cus_a", "cus_b"] } } })?.head,
	).toEqual({ label: "2 customers", prefix: "not" });
	expect(excluded?.groups[0][1]).toEqual({
		label: "And customer not in",
		chips: [
			{
				label: "2 customers",
				tile: { tone: "blue", glyph: "userMinus" },
				details: ["excluded"],
			},
		],
		moreCount: 0,
	});
});

test("plan properties map to coloured condition chips", () => {
	const result = view({
		customer: {
			plan: { paid: false, recurring: true, custom: false, price: null },
		},
	});
	expect(result?.groups[0]).toEqual([
		{
			label: "Where plan is",
			chips: [
				{ label: "Not custom", tile: { tone: "purple", glyph: "wrench" } },
			],
			moreCount: 0,
		},
		{
			label: "And plan is",
			chips: [
				{ label: "Free", tile: { tone: "amber", glyph: "currencyDollar" } },
			],
			moreCount: 0,
		},
		{
			label: "And plan is",
			chips: [
				{
					label: "Recurring",
					tile: { tone: "blue", glyph: "arrowsClockwise" },
				},
			],
			moreCount: 0,
		},
		{
			label: "And base price",
			chips: [
				{
					label: "No base price",
					tile: { tone: "amber", glyph: "currencyCircleDollar" },
				},
			],
			moreCount: 0,
		},
	]);
	expect(result?.extraCount).toBe(3);
});

test("OR groups keep their own rows and count toward the extras", () => {
	const result = view({
		customer: {
			$or: [
				{ plan: { plan_id: "starter", paid: true } },
				{ plan: { $none: {} } },
			],
		},
	});
	expect(result?.extraCount).toBe(2);
	expect(result?.groups.map((group) => group.map((row) => row.label))).toEqual([
		["Where plan is", "And plan is"],
		["Plan"],
	]);
});

test("a plan filter on ten plans caps its chips and counts the rest", () => {
	const result = view({
		customer: { plan: { plan_id: { $in: TEN_PLAN_VARIANTS } } },
	});
	expect(result?.head).toEqual({ label: "Hobby" });
	expect(result?.extraCount).toBe(9);
	expect(result?.groups).toEqual([
		[
			{
				label: "Where plan in",
				chips: [
					{ label: "Hobby" },
					{ label: "Hobby (10k credits/month)" },
					{ label: "Hobby (25k credits/month)" },
				],
				moreCount: 7,
			},
		],
	]);
});
