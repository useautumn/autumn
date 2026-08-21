import { describe, expect, test } from "bun:test";
import { createAutumnMcpServerCard } from "../../../src/server/serverCard.js";

describe("Autumn MCP server card", () => {
	test("publishes a public tool index without credentials", () => {
		const card = createAutumnMcpServerCard({
			serverUrl: "https://mcp.useautumn.com/mcp",
		});

		expect(card).toMatchObject({
			name: "Autumn",
			version: "0.0.1",
			serverUrl: "https://mcp.useautumn.com/mcp",
		});
		expect(card.tools.length).toBeGreaterThan(0);
		expect(card.tools.every((tool) => tool.name && tool.description)).toBe(
			true,
		);
	});
});
