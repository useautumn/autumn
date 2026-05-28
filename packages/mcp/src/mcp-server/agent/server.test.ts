import { describe, expect, test } from "bun:test";
import {
	createAskAutumnMCPServer,
	createAutumnOperationsMCPServer,
} from "./server.js";

describe("Autumn MCP server", () => {
	test("public server advertises raw operation tools", async () => {
		const tools = await createAutumnOperationsMCPServer().getToolListInfo();

		expect(tools.tools.map((tool) => tool.name)).toEqual([
			"listCustomers",
			"getCustomer",
			"listPlans",
			"getPlan",
			"previewAttach",
			"previewUpdateSubscription",
			"attach",
			"updateSubscription",
		]);
		expect(tools.tools.map((tool) => tool.name)).not.toContain("ask_autumn");
		expect(tools.tools.map((tool) => tool.name)).not.toContain(
			"confirmBillingAction",
		);
	});

	test("internal server advertises only ask_autumn", async () => {
		const tools = await createAskAutumnMCPServer().getToolListInfo();

		expect(tools.tools.map((tool) => tool.name)).toEqual(["ask_autumn"]);
		expect(tools.tools.map((tool) => tool.name)).not.toContain("attach");
		expect(tools.tools.map((tool) => tool.name)).not.toContain("listCustomers");
	});
});
