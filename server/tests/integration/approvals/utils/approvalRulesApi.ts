import type { ApprovalRule, ApprovalRuleVersion } from "@autumn/shared";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import {
	type DashboardSession,
	dashboardFetch,
} from "@tests/utils/testInitUtils/dashboardSession.js";

export type ApprovalRuleErrorBody = {
	code: string;
	message: string;
	details?: { issues?: { path: string; message: string }[] };
};

/** Calls the dashboard `approval_rules.*` RPC routes as `session`; returns status and parsed body. */
export const approvalRulesApi = ({
	ctx,
	session,
}: {
	ctx: TestContext;
	session: DashboardSession;
}) => {
	const call = <T>(verb: string, body: unknown) =>
		dashboardFetch<T>(ctx, session, `/approval_rules.${verb}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: typeof body === "string" ? body : JSON.stringify(body),
		});
	return {
		list: () => call<{ list: ApprovalRule[] }>("list", {}),
		get: (id: string) => call<ApprovalRule>("get", { id }),
		create: (body: unknown) => call<ApprovalRule>("create", body),
		update: (body: unknown) => call<ApprovalRule>("update", body),
		delete: (id: string) => call<{ success: true }>("delete", { id }),
		reorder: (ids: string[]) =>
			call<{ list: ApprovalRule[] }>("reorder", { ids }),
		versions: (id: string) =>
			call<{ list: ApprovalRuleVersion[] }>("versions.list", { id }),
		raw: <T = ApprovalRuleErrorBody>(verb: string, body: unknown) =>
			call<T>(verb, body),
	};
};
