import { describe, expect, test } from "bun:test";

type Line = { plan_id: string | null; description: string; amount: number };

const orderLines = (lines: Line[]) => [
	...lines
		.filter((line) => line.plan_id === null)
		.sort((a, b) => b.amount - a.amount),
	...lines.filter((line) => line.plan_id !== null),
];

describe("invoice line order", () => {
	test("custom charges lead, highest amount first", () => {
		const ordered = orderLines([
			{ plan_id: null, description: "a", amount: 1 },
			{ plan_id: null, description: "t", amount: 20 },
			{ plan_id: null, description: "k", amount: 11 },
		]);

		expect(ordered.map((line) => line.description)).toEqual(["t", "k", "a"]);
	});

	test("plan lines stay after custom charges regardless of amount", () => {
		const ordered = orderLines([
			{ plan_id: "pro", description: "Inv Seats", amount: 200 },
			{ plan_id: null, description: "bosh", amount: 67 },
		]);

		expect(ordered.map((line) => line.description)).toEqual([
			"bosh",
			"Inv Seats",
		]);
	});

	test("plan lines keep the server's order", () => {
		const ordered = orderLines([
			{ plan_id: "a", description: "first", amount: 10 },
			{ plan_id: "b", description: "second", amount: 99 },
		]);

		expect(ordered.map((line) => line.description)).toEqual([
			"first",
			"second",
		]);
	});
});
