import type { ApprovalRule, ApprovalRuleParams } from "@autumn/shared";
import type { ApprovalPrincipal } from "@autumn/shared/api/approvals/evaluate/index.js";

const user = ({
	role,
	userId = `usr_${role}`,
}: {
	role: string;
	userId?: string;
}): ApprovalPrincipal => ({ type: "user", user_id: userId, role });

const apiKey = ({ keyId = "key_test" }: { keyId?: string } = {}) =>
	({ type: "api_key", key_id: keyId }) satisfies ApprovalPrincipal;

export const principals = { user, apiKey } as const;

/** A rule as it comes back from storage, built from a `rules.*` fixture. */
export const storedRule = ({
	id,
	rule,
}: {
	id: string;
	rule: ApprovalRuleParams;
}): ApprovalRule => ({
	...rule,
	id,
	version: 1,
	updated_by: { user_id: "usr_admin", name: "Admin" },
	created_at: 0,
	updated_at: 0,
});
