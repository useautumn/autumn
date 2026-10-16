/**
 * Removing a member drops the approval rule subjects that name them (Stage 3, D4a).
 *
 * Contract:
 * - An admin removing a member (POST /organization/remove-member) deletes that user's subject rows.
 * - Removal through better-auth's removeMember endpoint does the same.
 * - Other subjects on the same rule are kept.
 */

import { expect, test } from "bun:test";
import { member } from "@autumn/shared";
import { dashboardFetch } from "@tests/utils/testInitUtils/dashboardSession.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { approvalRuleRepo } from "@/internal/approvals/repos/index.js";
import { auth } from "@/utils/auth.js";
import { generateId } from "@/utils/genUtils.js";

test(`${chalk.yellowBright("member removed: both removal paths drop the member's rule subjects")}`, async () => {
	const { ctx, members } = await initScenario({
		setup: [
			s.member({ role: "owner" }),
			s.member({ role: "sales" }),
			s.member({ role: "sales" }),
		],
		actions: [],
	});
	const [owner, removed, leaver] = members;
	const live = { db: ctx.db, orgId: ctx.org.id };
	const ruleId = generateId("apr");
	await approvalRuleRepo.insert({
		...live,
		userId: owner.userId,
		rule: {
			id: ruleId,
			name: "Named members",
			effect: "block",
			subjects: [
				{ subject_type: "user", subject_id: removed.userId },
				{ subject_type: "user", subject_id: leaver.userId },
				{ subject_type: "role", subject_id: "sales" },
			],
			actions: ["billing.attach"],
			filter: null,
			note: null,
			enabled: true,
		},
	});
	const subjectIds = async () =>
		(await approvalRuleRepo.get({ ...live, ruleId }))?.subjects.map(
			(subject) => subject.subject_id,
		);

	try {
		const removal = await dashboardFetch(
			ctx,
			owner,
			"/organization/remove-member",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ memberId: "", userId: removed.userId }),
			},
		);
		expect(removal.status).toBe(200);
		expect(await subjectIds()).toEqual([leaver.userId, "sales"]);

		// Removal through better-auth's own endpoint runs the afterRemoveMember hook instead.
		const leaverMember = await ctx.db.query.member.findFirst({
			where: eq(member.userId, leaver.userId),
		});
		await auth.api.removeMember({
			headers: owner.headers,
			body: {
				memberIdOrEmail: leaverMember?.id ?? "",
				organizationId: ctx.org.id,
			},
		});
		expect(await subjectIds()).toEqual(["sales"]);
	} finally {
		await approvalRuleRepo.delete({ ...live, ruleId });
		await Promise.all(members.map((m) => m.cleanup()));
	}
});
