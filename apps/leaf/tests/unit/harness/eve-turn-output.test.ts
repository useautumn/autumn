import { describe, expect, test } from "bun:test";
import { eveTurnProducedOutput } from "../../../src/harness/eve/turnOutput.js";

describe("eveTurnProducedOutput", () => {
	test("a turn that ends with no text and nothing pending recovers", () => {
		expect(eveTurnProducedOutput({ text: "" })).toBe(false);
		expect(eveTurnProducedOutput({ text: "   \n" })).toBe(false);
		expect(eveTurnProducedOutput({})).toBe(false);
	});

	test("any user-visible result keeps the turn", () => {
		expect(eveTurnProducedOutput({ text: "Attached pro." })).toBe(true);
		expect(
			eveTurnProducedOutput({ catalogDecision: { id: "pro" }, text: "" }),
		).toBe(true);
	});
});
