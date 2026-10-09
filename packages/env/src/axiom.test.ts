import { describe, expect, test } from "bun:test";
import { createAxiomEnv } from "./axiom.js";

describe("Axiom environment", () => {
	test("reads each token and the org, trimmed", () => {
		const env = createAxiomEnv({
			AXIOM_ADMIN_TOKEN: " xapt-admin ",
			AXIOM_ORG_ID: "autumn",
			AXIOM_ATOM_ADMIN_TOKEN: "xapt-atom",
		});

		expect(env).toEqual({
			AXIOM_ADMIN_TOKEN: "xapt-admin",
			AXIOM_ORG_ID: "autumn",
			AXIOM_ATOM_ADMIN_TOKEN: "xapt-atom",
		});
	});

	test.each([undefined, "", "  "] as const)(
		"every variable is optional: %p is null",
		(value) => {
			const env = createAxiomEnv({
				AXIOM_ADMIN_TOKEN: value,
				AXIOM_ORG_ID: value,
				AXIOM_ATOM_ADMIN_TOKEN: value,
			});

			expect(env).toEqual({
				AXIOM_ADMIN_TOKEN: null,
				AXIOM_ORG_ID: null,
				AXIOM_ATOM_ADMIN_TOKEN: null,
			});
		},
	);
});
