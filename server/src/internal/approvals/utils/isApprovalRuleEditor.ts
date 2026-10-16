import { isScopeSubset, MODERN_SCOPES } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const RULE_EDITOR_ROLES = ["owner", "admin"];

/**
 * Owners and admins edit rules, as do secret keys with every scope (`[]` is a legacy unrestricted key).
 * OAuth and MCP tokens carry no key id, so they're judged by their member's role.
 */
export const isApprovalRuleEditor = ({
	ctx,
}: {
	ctx: Pick<AutumnContext, "apiKeyId" | "role" | "scopes">;
}) => {
	if (ctx.apiKeyId)
		return ctx.scopes.length === 0 || isScopeSubset(MODERN_SCOPES, ctx.scopes);
	return ctx.role !== undefined && RULE_EDITOR_ROLES.includes(ctx.role);
};
