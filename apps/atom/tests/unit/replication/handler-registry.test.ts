import { describe, expect, test } from "bun:test";
import { createHandlerRegistry } from "../../../src/replication/handlers/createHandlerRegistry.js";

describe("the kinds an Atom replicates", () => {
	test("each name the route a peer posts them to; a kind nobody registered is a programming error", () => {
		const registry = createHandlerRegistry();
		registry.register({ kind: "subjects.set", path: "/v1/subjects.set" });
		registry.register({ kind: "catalog.set", path: "/v1/catalog.set" });

		expect(registry.pathOf({ kind: "catalog.set" })).toBe("/v1/catalog.set");
		expect(registry.handlers().map((handler) => handler.kind)).toEqual([
			"subjects.set",
			"catalog.set",
		]);
		expect(() => registry.pathOf({ kind: "deductions.apply" })).toThrow(
			"deductions.apply",
		);
	});
});
