/**
 * The rename paths call the rule rewrite (Track D, D3).
 *
 * Contract: catalog plan renames (executeRenamePlans), catalog feature renames
 * (executeFeatureReferenceRewrites) and the legacy feature update (handleFeatureIdChanged)
 * each rewrite live rules that reference the old id.
 */

import { expect, test } from "bun:test";
import { AppEnv, type Feature, productAliases } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { approvalRuleRepo } from "@/internal/approvals/repos/index.js";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan.js";
import type { UpdateFeaturePlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateFeaturePlan.js";
import { executeFeatureReferenceRewrites } from "@/internal/catalogV2/execute/executeFeatureReferenceRewrites.js";
import { executeRenamePlans } from "@/internal/catalogV2/execute/executeRenamePlans.js";
import { handleFeatureIdChanged } from "@/internal/features/utils/updateFeatureUtils/handleFeatureIdChanged.js";
import { generateId } from "@/utils/genUtils.js";

const live = { db: ctx.db, orgId: ctx.org.id, env: AppEnv.Live };
const liveCtx = { ...ctx, env: AppEnv.Live };

const saveRule = async ({ when }: { when: unknown }) => {
	const id = generateId("apr");
	await approvalRuleRepo.upsert({
		...live,
		userId: "usr_author",
		rule: {
			id,
			name: "Rename hook",
			subjects: [{ subject_type: "everyone", subject_id: "*" }],
			actions: ["billing.attach"],
			when,
			note: null,
			enabled: true,
		},
	});
	return id;
};

const storedWhen = async (ruleId: string) =>
	(await approvalRuleRepo.get({ ...live, ruleId }))?.when;

// The rename SQL only touches rows that exist; these ids exist nowhere but the rules.
const ghostFeature = ({ id }: { id: string }) =>
	({ id, internal_id: generateId("fe") }) as Feature;

test(`${chalk.yellowBright("rename hooks: catalog plan, catalog feature and legacy feature renames rewrite rules")}`, async () => {
	const suffix = crypto.randomUUID().slice(0, 8);
	const plan = `plan_${suffix}`;
	const catalogFeature = `cat_feature_${suffix}`;
	const legacyFeature = `legacy_feature_${suffix}`;
	const planRule = await saveRule({
		when: { incoming: { $every: { plan_id: plan } } },
	});
	const catalogFeatureRule = await saveRule({
		when: { feature_id: catalogFeature },
	});
	const legacyFeatureRule = await saveRule({
		when: { feature_id: legacyFeature },
	});

	try {
		await executeRenamePlans({
			ctx: liveCtx,
			updateCatalogPlan: {
				renamePlans: [{ planId: plan, toId: `${plan}_v2` }],
			} as UpdateCatalogPlan,
		});
		expect(await storedWhen(planRule)).toEqual({
			incoming: { $every: { plan_id: `${plan}_v2` } },
		});

		await executeFeatureReferenceRewrites({
			ctx: liveCtx,
			updateFeaturePlan: {
				current: ghostFeature({ id: catalogFeature }),
				rewrites: {
					typeChange: null,
					idChange: { fromId: catalogFeature, toId: `${catalogFeature}_v2` },
					usageTypeChange: null,
					updateCreditSystemSchemas: [],
				},
			} as unknown as UpdateFeaturePlan,
		});
		expect(await storedWhen(catalogFeatureRule)).toEqual({
			feature_id: `${catalogFeature}_v2`,
		});

		await handleFeatureIdChanged({
			ctx: liveCtx,
			feature: ghostFeature({ id: legacyFeature }),
			linkedEntitlements: [],
			entitlements: [],
			prices: [],
			creditSystems: [],
			newId: `${legacyFeature}_v2`,
		});
		expect(await storedWhen(legacyFeatureRule)).toEqual({
			feature_id: `${legacyFeature}_v2`,
		});
	} finally {
		await Promise.all(
			[planRule, catalogFeatureRule, legacyFeatureRule].map((ruleId) =>
				approvalRuleRepo.delete({ ...live, ruleId }),
			),
		);
		await ctx.db
			.delete(productAliases)
			.where(
				and(
					eq(productAliases.org_id, ctx.org.id),
					eq(productAliases.env, AppEnv.Live),
					eq(productAliases.alias_id, plan),
				),
			);
	}
});
