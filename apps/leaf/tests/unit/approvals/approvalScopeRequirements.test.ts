import { describe, expect, test } from "bun:test";
import { APPROVAL_GATED_TOOL_NAMES } from "@autumn/mcp/approval-gated";
import { approvalScopeRequirements } from "../../../src/internal/approvals/utils/approvalScopeRequirements.js";

describe("approval scope requirements", () => {
	test("every approval-gated MCP tool declares a scope requirement", () => {
		const missing = APPROVAL_GATED_TOOL_NAMES.filter(
			(toolName) => !approvalScopeRequirements[toolName],
		);
		expect(missing).toEqual([]);
	});

	test("no scope requirement refers to a tool that no longer exists", () => {
		const known = new Set(APPROVAL_GATED_TOOL_NAMES);
		const stale = Object.keys(approvalScopeRequirements).filter(
			(toolName) => !known.has(toolName),
		);
		expect(stale).toEqual([]);
	});
});
