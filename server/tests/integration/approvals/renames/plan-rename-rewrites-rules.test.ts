/**
 * Renaming a plan or feature rewrites live approval rules that reference it (Track D, D3).
 *
 * Contract:
 * - A live plan rename moves `plan_id` references in the org's rules to the new id.
 * - A live feature rename moves `feature_id` references the same way.
 * - Renames in sandbox leave rules alone: rules are live-only, and the ids are per env.
 * - Rules of other orgs and other ids are untouched; versions don't change (it's a reference fix, not an edit).
 * - Concurrent renames touching one rule serialize, so neither undoes the other.
 */

import { expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { rewriteApprovalRuleIds } from "@/internal/approvals/renames/rewriteApprovalRuleIds.js";
import { approvalRuleRepo } from "@/internal/approvals/repos/index.js";
import { generateId } from "@/utils/genUtils.js";

const live = { db: ctx.db, orgId: ctx.org.id, env: AppEnv.Live };

const saveRule = async ({ when }: { when: unknown }) => {
	const id = generateId("apr");
	await approvalRuleRepo.upsert({
		...live,
		userId: "usr_author",
		rule: {
			id,
			name: "Rename target",
			subjects: [{ subject_type: "role", subject_id: "sales" }],
			actions: ["billing.attach"],
			when,
			note: null,
			enabled: true,
		},
	});
	return id;
};

const storedRule = (ruleId: string) =>
	approvalRuleRepo.get({ ...live, ruleId });

test(`${chalk.yellowBright("renames: live plan and feature renames rewrite rules; sandbox renames don't")}`, async () => {
	const suffix = crypto.randomUUID().slice(0, 8);
	const pro = `pro_${suffix}`;
	const credits = `credits_${suffix}`;
	const planRuleId = await saveRule({
		when: { incoming: { $every: { plan_id: pro } } },
	});
	const featureRuleId = await saveRule({
		when: { feature_id: credits, included_grant: { $lte: 50 } },
	});

	try {
		await rewriteApprovalRuleIds({
			ctx: { ...ctx, env: AppEnv.Sandbox },
			key: "plan_id",
			fromId: pro,
			toId: `${pro}_v2`,
		});
		expect((await storedRule(planRuleId))?.when).toEqual({
			incoming: { $every: { plan_id: pro } },
		});

		await rewriteApprovalRuleIds({
			ctx: { ...ctx, env: AppEnv.Live },
			key: "plan_id",
			fromId: pro,
			toId: `${pro}_v2`,
		});
		const planRule = await storedRule(planRuleId);
		expect(planRule?.when).toEqual({
			incoming: { $every: { plan_id: `${pro}_v2` } },
		});
		expect(planRule?.version).toBe(1);

		await rewriteApprovalRuleIds({
			ctx: { ...ctx, env: AppEnv.Live },
			key: "feature_id",
			fromId: credits,
			toId: `${credits}_v2`,
		});
		expect((await storedRule(featureRuleId))?.when).toEqual({
			feature_id: `${credits}_v2`,
			included_grant: { $lte: 50 },
		});
	} finally {
		await approvalRuleRepo.delete({ ...live, ruleId: planRuleId });
		await approvalRuleRepo.delete({ ...live, ruleId: featureRuleId });
	}
});

test(`${chalk.yellowBright("renames: parallel renames of two ids in one rule both land")}`, async () => {
	const suffix = crypto.randomUUID().slice(0, 8);
	const [first, second] = [`first_${suffix}`, `second_${suffix}`];
	const ruleId = await saveRule({
		when: { $or: [{ feature_id: first }, { feature_id: second }] },
	});
	const liveCtx = { ...ctx, env: AppEnv.Live };

	try {
		await Promise.all([
			rewriteApprovalRuleIds({
				ctx: liveCtx,
				key: "feature_id",
				fromId: first,
				toId: `${first}_v2`,
			}),
			rewriteApprovalRuleIds({
				ctx: liveCtx,
				key: "feature_id",
				fromId: second,
				toId: `${second}_v2`,
			}),
		]);
		expect((await storedRule(ruleId))?.when).toEqual({
			$or: [{ feature_id: `${first}_v2` }, { feature_id: `${second}_v2` }],
		});
	} finally {
		await approvalRuleRepo.delete({ ...live, ruleId });
	}
});
