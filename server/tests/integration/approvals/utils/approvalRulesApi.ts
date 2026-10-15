import type { ApprovalRule, CreateApprovalRuleParams } from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import {
	type DashboardSession,
	dashboardFetch,
} from "@tests/utils/testInitUtils/dashboardSession.js";

const send = (method: string, body?: unknown): RequestInit => ({
	method,
	headers: { "content-type": "application/json" },
	body: body === undefined ? undefined : JSON.stringify(body),
});

/** Calls the dashboard rule routes as `session`; returns status and parsed body. */
export const approvalRulesApi = ({
	ctx,
	session,
}: {
	ctx: TestContext;
	session: DashboardSession;
}) => ({
	create: (params: CreateApprovalRuleParams | Record<string, unknown>) =>
		dashboardFetch<ApprovalRule>(
			ctx,
			session,
			"/approvals/rules",
			send("POST", params),
		),
	get: (ruleId: string) =>
		dashboardFetch<ApprovalRule>(ctx, session, `/approvals/rules/${ruleId}`),
	list: (query: Record<string, string> = {}) =>
		dashboardFetch<{ list: ApprovalRule[] }>(
			ctx,
			session,
			`/approvals/rules?${new URLSearchParams(query)}`,
		),
	update: (ruleId: string, params: Record<string, unknown>) =>
		dashboardFetch<ApprovalRule>(
			ctx,
			session,
			`/approvals/rules/${ruleId}`,
			send("PATCH", params),
		),
	delete: (ruleId: string) =>
		dashboardFetch<{ deleted: boolean }>(
			ctx,
			session,
			`/approvals/rules/${ruleId}`,
			send("DELETE"),
		),
	versions: (ruleId: string) =>
		dashboardFetch<{ list: unknown[] }>(
			ctx,
			session,
			`/approvals/rules/${ruleId}/versions`,
		),
});
