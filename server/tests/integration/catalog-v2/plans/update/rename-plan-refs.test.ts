/**
 * catalogV2.update — new_plan_id with existing references. Renames move every
 * version row plus plan-id refs (reward programs, rewards, RevenueCat
 * mappings) atomically; customer_products.product_id stays as a historical
 * snapshot and customers keep resolving via internal_product_id.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	customerProducts,
	products,
	ResetInterval,
	revenuecatMappings,
	rewardPrograms,
	rewards,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
	expectDbPlansAbsent,
} from "../utils/expectCatalogPlans.js";
import {
	cleanupRefs,
	seedCustomerProductRef,
	seedRevenueCatMappingRef,
	seedRewardProgramRef,
} from "../utils/seedPlanRefs.js";

const getPlanVersionRows = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}) =>
	ctx.db
		.select()
		.from(products)
		.where(
			and(
				eq(products.org_id, ctx.org.id),
				eq(products.env, ctx.env),
				eq(products.id, planId),
			),
		);

test.concurrent(
	`${chalk.yellowBright("catalogV2 rename refs: rename with customers moves every version row, cus product snapshot untouched")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ren_cus");
		const newPlanId = uniqueTestId("cv2_ren_cus_new");
		await deleteDbPlans({ ctx, planIds: [planId, newPlanId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Rename With Customers",
						price: { amount: 10, interval: BillingInterval.Month },
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 50,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});
			const { cusProductId } = await seedCustomerProductRef({ ctx, planId });

			// Mint a second version; the rename must move both rows.
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "new_version",
						active: true,
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, new_plan_id: newPlanId }],
			});

			await expectDbPlansAbsent({ ctx, planIds: [planId] });
			const renamedRows = await getPlanVersionRows({ ctx, planId: newPlanId });
			expect(renamedRows.map((row) => row.version).sort()).toEqual([1, 2]);
			const renamedV1 = renamedRows.find((row) => row.version === 1);
			expect(renamedV1).toBeDefined();

			const [cusProduct] = await ctx.db
				.select()
				.from(customerProducts)
				.where(eq(customerProducts.id, cusProductId));
			expect(cusProduct.product_id).toBe(planId);
			expect(cusProduct.internal_product_id).toBe(renamedV1!.internal_id);

			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{ id: newPlanId, name: "Rename With Customers", version: 2 },
				],
			});
		} finally {
			await cleanupRefs({ ctx, planIds: [planId, newPlanId] });
			await deleteDbPlans({ ctx, planIds: [planId, newPlanId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 rename refs: reward program, reward free_product_id + discount_config rewritten")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ren_rew");
		const newPlanId = uniqueTestId("cv2_ren_rew_new");
		await deleteDbPlans({ ctx, planIds: [planId, newPlanId] });
		let rewardId: string | undefined;
		let programId: string | undefined;
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Reward Linked",
						price: { amount: 20, interval: BillingInterval.Month },
					},
				],
			});
			({ rewardId, programId } = await seedRewardProgramRef({ ctx, planId }));

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, new_plan_id: newPlanId }],
			});

			const [program] = await ctx.db
				.select()
				.from(rewardPrograms)
				.where(eq(rewardPrograms.id, programId!));
			expect(program.product_ids).toEqual([newPlanId]);

			// One reward row referencing the plan via both columns — proves the
			// rewrite merges same-row touches into a single UPDATE.
			const [reward] = await ctx.db
				.select()
				.from(rewards)
				.where(eq(rewards.id, rewardId!));
			expect(reward.free_product_id).toBe(newPlanId);
			expect(reward.discount_config?.product_ids).toEqual([newPlanId]);
		} finally {
			await cleanupRefs({
				ctx,
				planIds: [planId, newPlanId],
				rewardId,
				programId,
			});
			await deleteDbPlans({ ctx, planIds: [planId, newPlanId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 rename refs: revenuecat mapping key rewritten")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_ren_rc");
		const newPlanId = uniqueTestId("cv2_ren_rc_new");
		await deleteDbPlans({ ctx, planIds: [planId, newPlanId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "RC Mapped" }],
			});
			await seedRevenueCatMappingRef({ ctx, planId });

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, new_plan_id: newPlanId }],
			});

			const mappings = await ctx.db
				.select()
				.from(revenuecatMappings)
				.where(
					and(
						eq(revenuecatMappings.org_id, ctx.org.id),
						eq(revenuecatMappings.env, ctx.env),
					),
				);
			expect(
				mappings.some((row) => row.autumn_product_id === newPlanId),
			).toBe(true);
			expect(
				mappings.some((row) => row.autumn_product_id === planId),
			).toBe(false);
		} finally {
			await cleanupRefs({ ctx, planIds: [planId, newPlanId] });
			await deleteDbPlans({ ctx, planIds: [planId, newPlanId] });
		}
	},
);
