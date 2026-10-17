import { describe, expect, test } from "bun:test";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { resolveApprovalPrincipal } from "@/internal/approvals/principal/resolveApprovalPrincipal";

const ctxWith = (fields: Partial<AutumnContext>) => fields as AutumnContext;

describe("resolveApprovalPrincipal", () => {
	test("a member (dashboard session or OAuth/MCP token) is judged with their role", () => {
		expect(
			resolveApprovalPrincipal({
				ctx: ctxWith({ userId: "u1", role: "sales" }),
			}),
		).toEqual({ user_id: "u1", role_id: "sales" });
	});

	test("an owner is a member like any other", () => {
		expect(
			resolveApprovalPrincipal({
				ctx: ctxWith({ userId: "u2", role: "owner" }),
			}),
		).toEqual({ user_id: "u2", role_id: "owner" });
	});

	test("an API key has no member, so it skips approvals", () => {
		expect(resolveApprovalPrincipal({ ctx: ctxWith({}) })).toBeNull();
		expect(
			resolveApprovalPrincipal({ ctx: ctxWith({ userId: "u3" }) }),
		).toBeNull();
	});
});
