/**
 * Renaming a plan or feature rewrites approval rules that reference it (Stage 3, D3).
 *
 * Contract:
 * - A live plan rename moves `plan_id` references in the org's rules to the new id.
 * - A live feature rename moves `feature_id` references the same way.
 * - Renames in sandbox leave rules alone: rules apply in live, and the ids are per env.
 * - Versions don't change: a rename fixes a reference, it doesn't edit the rule.
 * - Concurrent renames touching one rule serialize, so neither undoes the other.
 */

import { expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { rewriteApprovalRuleIds } from "@/internal/approvals/renames/rewriteApprovalRuleIds.js";
import { approvalRuleRepo } from "@/internal/approvals/repos/index.js";
import { generateId } from "@/utils/genUtils.js";

const saveRule = async ({ filter }: { filter: unknown }) => {
	const rule = await approvalRuleRepo.insert({
		db: ctx.db,
		orgId: ctx.org.id,
		userId: "usr_author",
		rule: {
			id: generateId("apr"),
			name: "Rename target",
			effect: "block",
			subjects: [{ subject_type: "everyone", subject_id: "*" }],
			actions: ["billing.attach"],
			filter,
			note: null,
			enabled: true,
		},
	});
	return rule.id;
};

const storedRule = (ruleId: string) =>
	approvalRuleRepo.get({ db: ctx.db, orgId: ctx.org.id, ruleId });

const deleteRule = (ruleId: string) =>
	approvalRuleRepo.delete({ db: ctx.db, orgId: ctx.org.id, ruleId });

const liveCtx = { ...ctx, env: AppEnv.Live };

test(`${chalk.yellowBright("renames: live plan and feature renames rewrite rules; sandbox renames don't")}`, async () => {
	const suffix = crypto.randomUUID().slice(0, 8);
	const pro = `pro_${suffix}`;
	const credits = `credits_${suffix}`;
	const planRuleId = await saveRule({
		filter: { incoming: { $every: { plan_id: pro } } },
	});
	const featureRuleId = await saveRule({
		filter: { feature_id: credits, included_grant: { $lte: 50 } },
	});

	try {
		await rewriteApprovalRuleIds({
			ctx: { ...ctx, env: AppEnv.Sandbox },
			key: "plan_id",
			fromId: pro,
			toId: `${pro}_v2`,
		});
		expect((await storedRule(planRuleId))?.filter).toEqual({
			incoming: { $every: { plan_id: pro } },
		});

		await rewriteApprovalRuleIds({
			ctx: liveCtx,
			key: "plan_id",
			fromId: pro,
			toId: `${pro}_v2`,
		});
		const planRule = await storedRule(planRuleId);
		expect(planRule?.filter).toEqual({
			incoming: { $every: { plan_id: `${pro}_v2` } },
		});
		expect(planRule?.version).toBe(1);

		await rewriteApprovalRuleIds({
			ctx: liveCtx,
			key: "feature_id",
			fromId: credits,
			toId: `${credits}_v2`,
		});
		expect((await storedRule(featureRuleId))?.filter).toEqual({
			feature_id: `${credits}_v2`,
			included_grant: { $lte: 50 },
		});
	} finally {
		await deleteRule(planRuleId);
		await deleteRule(featureRuleId);
	}
});

test(`${chalk.yellowBright("renames: parallel renames of two ids in one rule both land")}`, async () => {
	const suffix = crypto.randomUUID().slice(0, 8);
	const [first, second] = [`first_${suffix}`, `second_${suffix}`];
	const ruleId = await saveRule({
		filter: { $or: [{ feature_id: first }, { feature_id: second }] },
	});

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
		expect((await storedRule(ruleId))?.filter).toEqual({
			$or: [{ feature_id: `${first}_v2` }, { feature_id: `${second}_v2` }],
		});
	} finally {
		await deleteRule(ruleId);
	}
});
