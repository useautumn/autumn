import { describe, expect, test } from "bun:test";
import { createAutumnMastraMCPServer } from "./server.js";

describe("Autumn MCP server", () => {
	test("advertises only ask_autumn", async () => {
		const tools = await createAutumnMastraMCPServer().getToolListInfo();

		expect(tools.tools.map((tool) => tool.name)).toEqual(["ask_autumn"]);
		expect(tools.tools.map((tool) => tool.name)).not.toContain("attach");
		expect(tools.tools.map((tool) => tool.name)).not.toContain("listCustomers");
	});
});
