import { expect, test } from "bun:test";
import { formatValue } from "./helpers.js";

test("formatValue quotes unsafe object keys and omits undefined object fields", () => {
	const code = formatValue({
		"custom/internal-model": {
			markup: 0,
			inputCost: 5,
			outputCost: 15,
		},
		"anthropic/claude-sonnet-4-20250514": {
			markup: 0,
			inputCost: undefined,
			outputCost: undefined,
		},
		custom: {
			markup: 30,
		},
	});

	expect(code).toContain("'custom/internal-model':");
	expect(code).toContain("'anthropic/claude-sonnet-4-20250514':");
	expect(code).toContain("custom:");
	expect(code).toContain("inputCost: 5");
	expect(code).not.toContain("inputCost: undefined");
	expect(code).not.toContain("outputCost: undefined");
});
