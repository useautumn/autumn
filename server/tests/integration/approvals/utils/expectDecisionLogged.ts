import { expect } from "bun:test";
import { approvalDecisions } from "@autumn/shared/models/approvalModels/index";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { and, desc, eq } from "drizzle-orm";

/** The decision rows this member's writes logged for `action`, newest first. */
export const listDecisions = ({
	ctx,
	userId,
	action,
}: {
	ctx: TestContext;
	userId: string;
	action: string;
}) =>
	ctx.db
		.select()
		.from(approvalDecisions)
		.where(
			and(
				eq(approvalDecisions.org_id, ctx.org.id),
				eq(approvalDecisions.user_id, userId),
				eq(approvalDecisions.action, action),
			),
		)
		.orderBy(desc(approvalDecisions.created_at));

/** The newest decision for this member's `action`, asserted to exist with `verdict`. */
export const expectDecisionLogged = async ({
	ctx,
	userId,
	action,
	verdict,
}: {
	ctx: TestContext;
	userId: string;
	action: string;
	verdict: "allow" | "deny";
}) => {
	const [decision] = await listDecisions({ ctx, userId, action });
	expect(decision).toBeDefined();
	expect(decision.verdict).toBe(verdict);
	return decision;
};

/** A preview's permission and the decision its write logged must be the same verdict. */
export const expectPreviewMatchesDecision = ({
	permission,
	decision,
}: {
	permission: Record<string, unknown> | undefined;
	decision: typeof approvalDecisions.$inferSelect;
}) => {
	expect(permission).toBeDefined();
	expect(permission?.verdict).toBe(decision.verdict);
	expect(permission?.decided_by).toEqual(decision.decided_by);
	expect(permission?.violations ?? []).toEqual(decision.violations);
};
