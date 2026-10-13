import { describe, expect, test } from "bun:test";
import { atomLogOutputs } from "../../../src/lib/logging/atomLogOutputs.js";

describe("Atom log outputs", () => {
	test("a deployed Atom writes JSON lines", () => {
		expect(atomLogOutputs({ env: {} })).toEqual(["console-json"]);
	});

	test("a bundle with NODE_ENV inlined as development still writes JSON, so a log collector keeps every field", () => {
		expect(atomLogOutputs({ env: { NODE_ENV: "development" } })).toEqual([
			"console-json",
		]);
	});

	test("the dev stack asks for pretty output explicitly", () => {
		expect(atomLogOutputs({ env: { ATOM_PRETTY_LOGS: "true" } })).toEqual([
			"console-pretty",
		]);
	});
});
