import { describe, expect, test } from "bun:test";
import { createLogBudget } from "./logBudget.ts";

describe("createLogBudget", () => {
	test("chatty workers can't starve run-level or file logs", () => {
		const budget = createLogBudget({ perWorker: 100, perFile: 100, run: 100 });
		for (let i = 0; i < 1_000; i++)
			budget.take({ file: null, worker: `w${i % 50}`, chars: 10 });
		expect(budget.take({ file: null, worker: null, chars: 10 })).toBe(true);
		expect(budget.take({ file: "a.test.ts", worker: "w1", chars: 10 })).toBe(
			true,
		);
	});

	test("each stream stops at its own cap", () => {
		const budget = createLogBudget({ perWorker: 25, perFile: 25, run: 25 });
		expect(budget.take({ file: null, worker: "w1", chars: 20 })).toBe(true);
		expect(budget.take({ file: null, worker: "w1", chars: 20 })).toBe(false);
		expect(budget.take({ file: null, worker: "w2", chars: 20 })).toBe(true);
	});
});
