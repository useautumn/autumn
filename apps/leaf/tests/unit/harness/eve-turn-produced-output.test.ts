import { describe, expect, test } from "bun:test";

const { eveTurnProducedOutput } = await import(
	"../../../src/internal/agentRuntime/actions/runAgentTurn/execute/eveTurnReducer.js"
);

// This predicate decides whether a finished turn is posted to the user or
// treated as a wedged thread, so each case below names the turn it describes.
describe("eveTurnProducedOutput", () => {
	test("a turn that never produced text left the user nothing", () => {
		expect(eveTurnProducedOutput({})).toBe(false);
	});

	test("a turn whose whole reply is whitespace left the user nothing", () => {
		expect(eveTurnProducedOutput({ text: "   \n" })).toBe(false);
	});

	test("a turn that said something left the user a reply", () => {
		expect(eveTurnProducedOutput({ text: "Attached pro." })).toBe(true);
	});

	test("a turn that stopped on a catalog decision counts even with no text", () => {
		expect(
			eveTurnProducedOutput({ catalogDecision: { id: "pro" }, text: "" }),
		).toBe(true);
	});
});
