/** Who is acting. API keys aren't rule subjects in v1, so they always fall back to scopes. */
export type ApprovalPrincipal =
	| { type: "user"; user_id: string; role: string }
	| { type: "api_key"; key_id: string };

export type ApprovalUserPrincipal = Extract<
	ApprovalPrincipal,
	{ type: "user" }
>;

/** Rule-exempt roles, so nobody can lock out the people who edit rules. */
export const EXEMPT_ROLES = ["owner", "admin"];
