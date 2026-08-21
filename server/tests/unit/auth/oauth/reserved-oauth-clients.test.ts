import { describe, expect, test } from "bun:test";
import { isReservedOAuthClientName } from "@autumn/auth/oauth";

describe("isReservedOAuthClientName", () => {
	test("matches the denylist case- and whitespace-insensitively", () => {
		expect(isReservedOAuthClientName("ATMN")).toBe(true);
		expect(isReservedOAuthClientName("  Autumn CLI ")).toBe(true);
		expect(isReservedOAuthClientName("Autumn internal-mcp")).toBe(true);
		expect(isReservedOAuthClientName("Summer")).toBe(true);
	});

	test("allows ordinary client names", () => {
		expect(isReservedOAuthClientName("Cursor")).toBe(false);
		expect(isReservedOAuthClientName("Summerly")).toBe(false);
		expect(isReservedOAuthClientName("MCP client")).toBe(false);
	});
});
