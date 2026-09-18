import { expect, test } from "bun:test";
import { expectedApiCalls } from "../../evals/utils/scorers.js";

const score = (
	expected: Record<string, unknown>,
	actual: Record<string, unknown>,
) =>
	expectedApiCalls({
		expected: [
			{
				type: "api.called",
				calls: [{ toolName: "createSchedule", body: expected }],
			},
		],
		output: {
			apiCalls: [
				{
					toolName: "createSchedule",
					endpoint: "/v1/billing.create_schedule",
					body: actual,
				},
			],
			finalText: "",
			toolCalls: [],
		},
	});
const body = (filters: unknown[], key = "remove_items") => ({
	phases: [{ plans: [{ customize: { [key]: filters } }] }],
});

test("removal filters match as an unordered multiset without losing field checks", () => {
	const filters = [
		{ feature_id: "members" },
		{ feature_id: "credits", billing_method: "prepaid" },
	];
	expect(score(body(filters), body([...filters].reverse()))).toBe(1);
	expect(
		score(
			body(filters),
			body([
				{ feature_id: "members" },
				{ feature_id: "credits", billing_method: "usage_based" },
			]),
		),
	).toBe(0);
	expect(score(body(filters), body(filters.slice(1)))).toBe(0);
	expect(
		score(body(filters), body([...filters, { feature_id: "extra" }])),
	).toBe(0);
});

test("overlapping filters need distinct matching occurrences", () => {
	const expected = [
		{ feature_id: "credits" },
		{ feature_id: "credits", billing_method: "prepaid" },
	];
	expect(
		score(
			body(expected),
			body([
				{ feature_id: "credits", billing_method: "prepaid" },
				{ feature_id: "credits", billing_method: "usage_based" },
			]),
		),
	).toBe(1);
	expect(
		score(
			body(expected),
			body([
				{ feature_id: "credits", billing_method: "usage_based" },
				{ feature_id: "credits", billing_method: "usage_based" },
			]),
		),
	).toBe(0);
});

test("phase ordering, price tiers and metadata arrays remain ordered", () => {
	for (const key of ["phases", "tiers"]) {
		expect(
			score(
				{ [key]: [{ amount: 1 }, { amount: 2 }] },
				{ [key]: [{ amount: 2 }, { amount: 1 }] },
			),
		).toBe(0);
	}
	expect(
		score(
			{ metadata: { customize: { remove_items: [1, 2] } } },
			{ metadata: { customize: { remove_items: [2, 1] } } },
		),
	).toBe(0);
});

test("added items match as an unordered multiset with full field checks", () => {
	const items = [
		{ feature_id: "members", included: 25 },
		{
			feature_id: "credits",
			included: 100000,
			price: { tiers: [{ to: 101000, amount: 0, flat_amount: 200 }] },
		},
	];
	expect(
		score(body(items, "add_items"), body([...items].reverse(), "add_items")),
	).toBe(1);
	expect(
		score(
			body(items, "add_items"),
			body([items[0], { ...items[1], included: 1 }], "add_items"),
		),
	).toBe(0);
	expect(
		score(
			body(items, "add_items"),
			body(
				[
					items[0],
					{
						...items[1],
						price: { tiers: [{ to: 999, amount: 0, flat_amount: 200 }] },
					},
				],
				"add_items",
			),
		),
	).toBe(0);
});
