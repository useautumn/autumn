/** Who is acting: a member. API keys skip approvals, so they never reach the evaluator. */
export type ApprovalPrincipal = { user_id: string; role_id: string };
