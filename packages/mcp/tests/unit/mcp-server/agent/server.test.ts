import { describe, expect, test } from "bun:test";
import { autumnMcpResourceUris } from "../../../../src/resources/index.js";
import { createAutumnOperationsMCPServer } from "../../../../src/server/server.js";

describe("Autumn MCP server", () => {
	test("public server advertises raw operation tools", async () => {
		const tools = await createAutumnOperationsMCPServer().getToolListInfo();

		expect(tools.tools.map((tool) => tool.name)).toEqual([
			"listCustomers",
			"createCustomer",
			"getCustomer",
			"listPlans",
			"createPlan",
			"getPlan",
			"createBalance",
			"previewAttach",
			"previewUpdateSubscription",
			"previewCreateSchedule",
			"previewCreateBalance",
			"attach",
			"updateSubscription",
			"createSchedule",
		]);
		expect(tools.tools.map((tool) => tool.name)).not.toContain("ask_autumn");
		expect(tools.tools.map((tool) => tool.name)).not.toContain(
			"confirmBillingAction",
		);
	});

	test("billing tool schemas avoid legacy JSON Schema ids", async () => {
		const tools = await createAutumnOperationsMCPServer().getToolListInfo();

		for (const name of [
			"previewAttach",
			"attach",
			"previewUpdateSubscription",
			"updateSubscription",
		]) {
			const tool = tools.tools.find((tool) => tool.name === name);
			expect(JSON.stringify(tool?.inputSchema)).not.toContain('"id":');
		}
	});

	test("public server exposes Autumn composition docs", async () => {
		const server = createAutumnOperationsMCPServer();
		const resources = await server.listResources();

		expect(resources.resources.map((resource) => resource.uri)).toEqual(
			autumnMcpResourceUris,
		);

		for (const uri of autumnMcpResourceUris) {
			const resource = await server.readResource(uri);
			expect(resource.contents[0]?.text).toContain("# ");
		}
	});

	test("unknown resources are rejected", async () => {
		const server = createAutumnOperationsMCPServer();

		await expect(server.readResource("autumn://docs/missing")).rejects.toThrow(
			"Unknown Autumn MCP resource",
		);
		await expect(server.readResource("__proto__")).rejects.toThrow(
			"Unknown Autumn MCP resource",
		);
	});
});
