/**
 * Every rename path calls the rule rewrite (Stage 3, D3).
 *
 * Contract: catalog plan renames (executeRenamePlans), catalog feature renames
 * (executeFeatureRuleRewrite, right after each feature is saved), the legacy feature update (updateFeature, after the save) and
 * the legacy plan update with a new id (updateProduct) each rewrite live rules that reference the
 * old id, so a plan or feature created later with the old id doesn't inherit them. A legacy feature
 * update that fails validation leaves rules alone.
 */

import { expect, test } from "bun:test";
import {
	AppEnv,
	CreateProductV2ParamsSchema,
	type Feature,
	features,
	productAliases,
	products,
} from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import { approvalRuleRepo } from "@/internal/approvals/repos/index.js";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan.js";
import type { UpdateFeaturePlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateFeaturePlan.js";
import { executeFeatureRuleRewrite } from "@/internal/catalogV2/execute/executeFeatureRuleRewrite.js";
import { executeRenamePlans } from "@/internal/catalogV2/execute/executeRenamePlans.js";
import { createFeature } from "@/internal/features/featureActions/createFeature.js";
import { updateFeature } from "@/internal/features/featureActions/updateFeature.js";
import { updateProduct } from "@/internal/product/actions/updateProduct.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { constructProduct } from "@/internal/products/productUtils.js";
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

// The rename SQL only touches rows that exist; these ids exist nowhere but the rules.
const ghostFeature = ({ id }: { id: string }) =>
	({ id, internal_id: generateId("fe") }) as Feature;

test(`${chalk.yellowBright("rename hooks: catalog plan and catalog feature renames rewrite rules")}`, async () => {
	const suffix = crypto.randomUUID().slice(0, 8);
	const plan = `plan_${suffix}`;
	const catalogFeature = `cat_feature_${suffix}`;
	const planRule = await saveRule({
		filter: { incoming: { $every: { plan_id: plan } } },
	});
	const catalogFeatureRule = await saveRule({
		filter: { feature_id: catalogFeature },
	});

	try {
		await executeRenamePlans({
			ctx: liveCtx,
			updateCatalogPlan: {
				renamePlans: [{ planId: plan, toId: `${plan}_v2` }],
			} as UpdateCatalogPlan,
		});
		expect((await storedRule(planRule))?.filter).toEqual({
			incoming: { $every: { plan_id: `${plan}_v2` } },
		});

		await executeFeatureRuleRewrite({
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
		expect((await storedRule(catalogFeatureRule))?.filter).toEqual({
			feature_id: `${catalogFeature}_v2`,
		});
	} finally {
		await Promise.all([planRule, catalogFeatureRule].map(deleteRule));
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

test(`${chalk.yellowBright("rename hooks: the legacy plan update with a new id rewrites rules; a racing stale rename is refused")}`, async () => {
	const plan = `legacy_plan_${crypto.randomUUID().slice(0, 8)}`;
	const product = await ProductService.insert({
		db: ctx.db,
		product: constructProduct({
			productData: CreateProductV2ParamsSchema.parse({
				id: plan,
				name: "Legacy plan",
			}),
			orgId: ctx.org.id,
			env: AppEnv.Live,
		}),
	});
	const ruleId = await saveRule({
		filter: { incoming: { $every: { plan_id: plan } } },
	});

	try {
		const stale = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: product.internal_id,
			orgId: ctx.org.id,
			env: AppEnv.Live,
		});
		await updateProduct({
			ctx: liveCtx,
			query: {},
			productId: plan,
			updates: { id: `${plan}_v2` },
		});
		expect((await storedRule(ruleId))?.filter).toEqual({
			incoming: { $every: { plan_id: `${plan}_v2` } },
		});

		// A racing rename that read the plan before the first one saved is refused, so rules can't fall behind.
		await expect(
			updateProduct({
				ctx: liveCtx,
				query: {},
				productId: plan,
				initialFullProduct: stale,
				updates: { id: `${plan}_v3` },
			}),
		).rejects.toMatchObject({ statusCode: 409 });
		expect((await storedRule(ruleId))?.filter).toEqual({
			incoming: { $every: { plan_id: `${plan}_v2` } },
		});
	} finally {
		await deleteRule(ruleId);
		await ctx.db
			.delete(products)
			.where(eq(products.internal_id, product.internal_id));
	}
});

test(`${chalk.yellowBright("rename hooks: the legacy feature update rewrites rules only once the rename is saved")}`, async () => {
	const suffix = crypto.randomUUID().slice(0, 8);
	const meteredId = `legacy_metered_${suffix}`;
	const creditsId = `legacy_credits_${suffix}`;
	const metered = await createFeature({
		ctx: liveCtx,
		data: {
			id: meteredId,
			name: "Legacy metered",
			type: "metered",
			config: { usage_type: "single_use" },
		} as never,
		skipGenerateDisplay: true,
	});
	const credits = await createFeature({
		ctx: { ...liveCtx, features: metered ? [metered] : [] },
		data: {
			id: creditsId,
			name: "Legacy credits",
			type: "credit_system",
			config: {
				usage_type: "single_use",
				schema: [{ metered_feature_id: meteredId, credit_amount: 1 }],
			},
		} as never,
		skipGenerateDisplay: true,
	});
	const ruleId = await saveRule({ filter: { feature_id: creditsId } });

	try {
		// The credit schema fails validation after the id change has been planned.
		await expect(
			updateFeature({
				ctx: liveCtx,
				featureId: creditsId,
				updates: {
					id: `${creditsId}_bad`,
					config: { usage_type: "single_use", schema: [] },
				} as never,
			}),
		).rejects.toThrow();
		expect((await storedRule(ruleId))?.filter).toEqual({
			feature_id: creditsId,
		});

		await updateFeature({
			ctx: liveCtx,
			featureId: creditsId,
			updates: { id: `${creditsId}_v2` },
		});
		expect((await storedRule(ruleId))?.filter).toEqual({
			feature_id: `${creditsId}_v2`,
		});
	} finally {
		await deleteRule(ruleId);
		for (const feature of [credits, metered]) {
			if (feature)
				await ctx.db
					.delete(features)
					.where(eq(features.internal_id, feature.internal_id));
		}
	}
});
