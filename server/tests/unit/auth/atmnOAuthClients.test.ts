import { describe, expect, test } from "bun:test";
import { isAtmnOAuthClientRecord } from "@/internal/auth/oauth/atmnOAuthClients.js";

describe("isAtmnOAuthClientRecord", () => {
	test("does not classify arbitrary metadata values as atmn", () => {
		expect(
			isAtmnOAuthClientRecord({
				clientId: "client_123",
				name: "Third Party App",
				metadata: { description: "connects to atmn projects" },
			}),
		).toBe(false);
	});

	test("classifies explicit atmn metadata and names", () => {
		expect(
			isAtmnOAuthClientRecord({
				clientId: "client_123",
				name: "Third Party App",
				metadata: { kind: "atmn" },
			}),
		).toBe(true);

		expect(
			isAtmnOAuthClientRecord({
				clientId: "client_123",
				name: "atmn",
			}),
		).toBe(true);
	});
});
