/**
 * Approval decision repo (Track D, D1).
 *
 * Contract: insert writes one decision row that reads back unchanged.
 */

import { expect, test } from "bun:test";
import { approvalDecisions } from "@autumn/shared/models/approvalModels/index";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { eq } from "drizzle-orm";
import { approvalDecisionRepo } from "@/internal/approvals/repos/index.js";
import { generateId } from "@/utils/genUtils.js";

test.concurrent("approval decision repo: inserts a shadow deny", async () => {
	const decision = {
		id: generateId("apd"),
		org_id: ctx.org.id,
		request_id: generateId("req"),
		action: "billing.attach",
		user_id: "usr_sales",
		role: "sales",
		verdict: "deny" as const,
		enforced: false,
		decided_by: { level: "role" as const, rule_id: "apr_1", rule_name: "Sales trials" },
		rule_version: 2,
		violations: [
			{ field: "paid", label: "Charges customer", limit: false, actual: true },
		],
		facts: { paid: true, total: 20 },
	};

	try {
		await approvalDecisionRepo.insert({ db: ctx.db, decision });

		const [stored] = await ctx.db
			.select()
			.from(approvalDecisions)
			.where(eq(approvalDecisions.id, decision.id));
		expect(stored).toMatchObject(decision);
	} finally {
		await ctx.db
			.delete(approvalDecisions)
			.where(eq(approvalDecisions.id, decision.id));
	}
});
