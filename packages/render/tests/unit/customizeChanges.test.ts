import { describe, expect, test } from "bun:test";
import {
	buildCustomizeChanges,
	customizeNeedsCurrentPlan,
} from "../../src/billing/customizeChanges.js";

// Every change is an add or a remove — the verb is a property of the diff
// against the customer's current plan, never a hardcoded label. That is the
// model the dashboard renders, and Slack must render the same one.

const currentPlan = {
	id: "enterprise",
	items: [
		{ feature_id: "contacts", included: 250_000 },
		{ feature_id: "seats", included: 5 },
	],
	name: "Enterprise",
	price: { amount: 50, interval: "month" },
};

describe("buildCustomizeChanges — base price", () => {
	test("changing the price is a remove of the old and an add of the new", () => {
		expect(
			buildCustomizeChanges({
				currentPlan,
				customize: { price: { amount: 80, interval: "month" } },
			}),
		).toEqual([
			{
				kind: "remove",
				subject: "price",
				price: { amount: 50, interval: "month" },
			},
			{
				kind: "add",
				subject: "price",
				price: { amount: 80, interval: "month" },
			},
		]);
	});

	test("setting a price where none existed is just an add", () => {
		expect(
			buildCustomizeChanges({
				currentPlan: { ...currentPlan, price: null },
				customize: { price: { amount: 80, interval: "month" } },
			}),
		).toEqual([
			{
				kind: "add",
				subject: "price",
				price: { amount: 80, interval: "month" },
			},
		]);
	});

	test("price null removes the current price", () => {
		expect(
			buildCustomizeChanges({ currentPlan, customize: { price: null } }),
		).toEqual([
			{
				kind: "remove",
				subject: "price",
				price: { amount: 50, interval: "month" },
			},
		]);
	});

	test("a fresh attach has no current plan, so everything is an add", () => {
		expect(
			buildCustomizeChanges({
				currentPlan: null,
				customize: { price: { amount: 80, interval: "month" } },
			}),
		).toEqual([
			{
				kind: "add",
				subject: "price",
				price: { amount: 80, interval: "month" },
			},
		]);
	});
});

describe("buildCustomizeChanges — items", () => {
	test("add_items are adds", () => {
		expect(
			buildCustomizeChanges({
				currentPlan,
				customize: {
					add_items: [{ feature_id: "contacts", included: 500_000 }],
				},
			}),
		).toEqual([
			{
				kind: "add",
				subject: "item",
				item: { feature_id: "contacts", included: 500_000 },
			},
		]);
	});

	// A remove_items entry is a filter. The quantity being removed is whatever
	// the customer currently holds, resolved from the current plan.
	test("remove_items resolve the removed quantity from the current plan", () => {
		expect(
			buildCustomizeChanges({
				currentPlan,
				customize: { remove_items: [{ feature_id: "contacts" }] },
			}),
		).toEqual([
			{
				kind: "remove",
				subject: "item",
				item: { feature_id: "contacts", included: 250_000 },
			},
		]);
	});

	test("a remove filter that matches nothing still names the feature", () => {
		expect(
			buildCustomizeChanges({
				currentPlan,
				customize: { remove_items: [{ feature_id: "widgets" }] },
			}),
		).toEqual([
			{ kind: "remove", subject: "item", item: { feature_id: "widgets" } },
		]);
	});

	test("items (PUT) replaces: removes every current item, adds every new one", () => {
		expect(
			buildCustomizeChanges({
				currentPlan,
				customize: { items: [{ feature_id: "seats", included: 10 }] },
			}),
		).toEqual([
			{
				kind: "remove",
				subject: "item",
				item: { feature_id: "contacts", included: 250_000 },
			},
			{
				kind: "remove",
				subject: "item",
				item: { feature_id: "seats", included: 5 },
			},
			{
				kind: "add",
				subject: "item",
				item: { feature_id: "seats", included: 10 },
			},
		]);
	});

	test("removes come before adds so the table reads old → new", () => {
		const changes = buildCustomizeChanges({
			currentPlan,
			customize: {
				add_items: [{ feature_id: "contacts", included: 500_000 }],
				remove_items: [{ feature_id: "contacts" }],
			},
		});
		expect(changes.map((c) => c.kind)).toEqual(["remove", "add"]);
	});

	test("nothing to change yields no changes", () => {
		expect(buildCustomizeChanges({ currentPlan, customize: {} })).toEqual([]);
		expect(
			buildCustomizeChanges({ currentPlan, customize: undefined }),
		).toEqual([]);
	});
});

describe("buildCustomizeChanges — ordering", () => {
	test("all removes precede all adds, price before items within each", () => {
		const changes = buildCustomizeChanges({
			currentPlan: {
				items: [{ feature_id: "contacts", included: 250_000 }],
				price: { amount: 50, interval: "month" },
			},
			customize: {
				add_items: [{ feature_id: "contacts", included: 500_000 }],
				price: { amount: 80, interval: "month" },
				remove_items: [{ feature_id: "contacts" }],
			},
		});
		expect(changes.map((c) => `${c.kind}:${c.subject}`)).toEqual([
			"remove:price",
			"remove:item",
			"add:price",
			"add:item",
		]);
	});
});

describe("buildCustomizeChanges — remove filter matching", () => {
	// An item that omits interval_count means 1; a filter that says 1 explicitly
	// must still match it, or the remove row loses the quantity being removed.
	test("a filter with interval_count 1 matches an item that omits it", () => {
		expect(
			buildCustomizeChanges({
				currentPlan: {
					items: [
						{
							feature_id: "seats",
							included: 5,
							price: { interval: "month" },
						},
					],
				},
				customize: {
					remove_items: [
						{ feature_id: "seats", interval: "month", interval_count: 1 },
					],
				},
			}),
		).toEqual([
			{
				kind: "remove",
				subject: "item",
				item: {
					feature_id: "seats",
					included: 5,
					price: { interval: "month" },
				},
			},
		]);
	});
});

describe("buildCustomizeChanges — free trial", () => {
	const withTrial = {
		free_trial: {
			card_required: true,
			duration_length: 14,
			duration_type: "day",
		},
		items: [],
	};

	test("setting a trial on a plan with none is an add", () => {
		expect(
			buildCustomizeChanges({
				currentPlan: { items: [] },
				customize: {
					free_trial: { duration_length: 14, duration_type: "day" },
				},
			}),
		).toEqual([
			{
				kind: "add",
				subject: "free_trial",
				trial: { duration_length: 14, duration_type: "day" },
			},
		]);
	});

	test("changing a trial is a remove of the old and an add of the new", () => {
		expect(
			buildCustomizeChanges({
				currentPlan: withTrial,
				customize: {
					free_trial: { duration_length: 1, duration_type: "month" },
				},
			}),
		).toEqual([
			{
				kind: "remove",
				subject: "free_trial",
				trial: {
					card_required: true,
					duration_length: 14,
					duration_type: "day",
				},
			},
			{
				kind: "add",
				subject: "free_trial",
				trial: { duration_length: 1, duration_type: "month" },
			},
		]);
	});

	test("free_trial null removes the current trial", () => {
		expect(
			buildCustomizeChanges({
				currentPlan: withTrial,
				customize: { free_trial: null },
			}),
		).toEqual([
			{
				kind: "remove",
				subject: "free_trial",
				trial: {
					card_required: true,
					duration_length: 14,
					duration_type: "day",
				},
			},
		]);
	});
});

// Callers use this to decide whether to fetch the current plan at all; a miss
// here silently degrades every remove row above into an add-only diff.
describe("customizeNeedsCurrentPlan", () => {
	test("true for every customize shape that diffs against the current plan", () => {
		expect(customizeNeedsCurrentPlan({ price: { amount: 40 } })).toBe(true);
		expect(customizeNeedsCurrentPlan({ price: null })).toBe(true);
		expect(
			customizeNeedsCurrentPlan({ free_trial: { duration_length: 14 } }),
		).toBe(true);
		expect(customizeNeedsCurrentPlan({ free_trial: null })).toBe(true);
		expect(customizeNeedsCurrentPlan({ items: [] })).toBe(true);
		expect(
			customizeNeedsCurrentPlan({ remove_items: [{ feature_id: "seats" }] }),
		).toBe(true);
	});

	test("false for pure additions and empty patches", () => {
		expect(
			customizeNeedsCurrentPlan({ add_items: [{ feature_id: "seats" }] }),
		).toBe(false);
		expect(customizeNeedsCurrentPlan({})).toBe(false);
		expect(customizeNeedsCurrentPlan(undefined)).toBe(false);
		expect(customizeNeedsCurrentPlan(null)).toBe(false);
	});
});
