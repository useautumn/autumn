import { describe, expect, test } from "bun:test";
import {
	mcpSignatureFromToolset,
	type McpToolsetLike,
} from "../../../src/harness/claudeManaged/toolset.js";

const explicitAlwaysAllowToolset = {
	configs: [],
	default_config: { permission_policy: { type: "always_allow" } },
	mcp_server_name: "autumn",
	type: "mcp_toolset" as const,
} satisfies McpToolsetLike;

describe("mcpSignatureFromToolset", () => {
	test("normalizes omitted default permission policies to always_allow", () => {
		const omittedDefaultPolicy = {
			configs: [],
			default_config: {},
			mcp_server_name: "autumn",
			type: "mcp_toolset" as const,
		} satisfies McpToolsetLike;
		const emptyDefaultPolicy = {
			configs: [],
			default_config: { permission_policy: {} },
			mcp_server_name: "autumn",
			type: "mcp_toolset" as const,
		} satisfies McpToolsetLike;

		expect(mcpSignatureFromToolset(omittedDefaultPolicy)).toBe(
			mcpSignatureFromToolset(explicitAlwaysAllowToolset),
		);
		expect(mcpSignatureFromToolset(emptyDefaultPolicy)).toBe(
			mcpSignatureFromToolset(explicitAlwaysAllowToolset),
		);
	});

	test("normalizes empty permission policy objects to the effective default", () => {
		const explicitInheritedPolicy = {
			...explicitAlwaysAllowToolset,
			configs: [
				{
					name: "listCustomers",
					permission_policy: { type: "always_allow" },
				},
			],
		} satisfies McpToolsetLike;
		const emptyPolicyObject = {
			...explicitAlwaysAllowToolset,
			configs: [
				{
					name: "listCustomers",
					permission_policy: {},
				},
			],
		} satisfies McpToolsetLike;

		expect(mcpSignatureFromToolset(emptyPolicyObject)).toBe(
			mcpSignatureFromToolset(explicitInheritedPolicy),
		);
	});
});
