/**
 * Who edits approval rules (Stage 3, D2a): owner and admin roles, and secret keys with every scope.
 * OAuth and MCP tokens carry no key id, so their member's role decides.
 */

import { describe, expect, test } from "bun:test";
import { isApprovalRuleEditor } from "@/internal/approvals/utils/isApprovalRuleEditor.js";

describe("isApprovalRuleEditor", () => {
	test("only owner and admin roles edit rules", () => {
		const byRole = [
			"owner",
			"admin",
			"developer",
			"sales",
			"member",
			"finance",
			undefined,
		].map((role) => isApprovalRuleEditor({ ctx: { role, scopes: [] } }));
		expect(byRole).toEqual([true, true, false, false, false, false, false]);
	});

	test("a secret key needs every scope; a legacy unrestricted key has them", () => {
		const key = (scopes: string[]) =>
			isApprovalRuleEditor({
				ctx: { apiKeyId: "key_1", role: undefined, scopes },
			});
		expect(key([])).toBe(true);
		expect(key(["admin"])).toBe(true);
		expect(key(["organisation:write", "customers:write"])).toBe(false);
	});

	test("a key's creator role doesn't make the key an editor", () => {
		expect(
			isApprovalRuleEditor({
				ctx: { apiKeyId: "key_1", role: "owner", scopes: ["customers:read"] },
			}),
		).toBe(false);
	});
});
