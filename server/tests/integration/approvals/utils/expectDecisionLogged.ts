import { expect } from "bun:test";
import { AppEnv, type ApprovalAction } from "@autumn/shared";
import { approvalDecisions } from "@autumn/shared/models/approvalModels/index";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { and, desc, eq } from "drizzle-orm";

const listDecisions = ({
	ctx,
	userId,
	action,
}: {
	ctx: TestContext;
	userId: string;
	action: ApprovalAction;
}) =>
	ctx.db
		.select()
		.from(approvalDecisions)
		.where(
			and(
				eq(approvalDecisions.org_id, ctx.org.id),
				eq(approvalDecisions.env, AppEnv.Live),
				eq(approvalDecisions.user_id, userId),
				eq(approvalDecisions.action, action),
			),
		)
		.orderBy(desc(approvalDecisions.created_at));

/** The member's latest decision for `action` was logged with this verdict, unenforced in shadow mode. */
export const expectDecisionLogged = async ({
	ctx,
	userId,
	action,
	verdict,
	enforced = false,
}: {
	ctx: TestContext;
	userId: string;
	action: ApprovalAction;
	verdict: "allow" | "deny";
	enforced?: boolean;
}) => {
	const [decision] = await listDecisions({ ctx, userId, action });
	expect(decision).toBeDefined();
	expect(decision).toMatchObject({ verdict, enforced });
	return decision;
};

export const expectNoDecisionLogged = async ({
	ctx,
	userId,
	action,
}: {
	ctx: TestContext;
	userId: string;
	action: ApprovalAction;
}) => {
	expect(await listDecisions({ ctx, userId, action })).toEqual([]);
};
