/**
 * Seeds rows that reference a plan by public id (customer products, reward
 * programs, rewards, RevenueCat mappings) for rename / gate tests.
 */

import {
	CouponDurationType,
	CusProductStatus,
	customerProducts,
	customers,
	RewardTriggerEvent,
	RewardType,
	revenuecatMappings,
	rewardPrograms,
	rewards,
} from "@autumn/shared";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { generateId } from "@/utils/genUtils.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";

export const seedCustomerProductRef = async ({
	ctx,
	planId,
	vercelInstall,
}: {
	ctx: AutumnContext;
	planId: string;
	/** Marks the customer as a Vercel install (customers.processors.vercel). */
	vercelInstall?: boolean;
}) => {
	const full = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	const customerId = uniqueTestId("cv2_cus");
	const internalCustomerId = generateId("cus");
	const cusProductId = generateId("cus_prod");

	await ctx.db.insert(customers).values({
		internal_id: internalCustomerId,
		id: customerId,
		org_id: ctx.org.id,
		env: ctx.env,
		created_at: Date.now(),
		name: customerId,
		email: `${customerId}@test.com`,
		processors: vercelInstall
			? {
					vercel: {
						installation_id: `icfg_${customerId}`,
						access_token: "test_token",
						account_id: `acct_${customerId}`,
					},
				}
			: undefined,
	});

	await ctx.db.insert(customerProducts).values({
		id: cusProductId,
		internal_customer_id: internalCustomerId,
		product_id: planId,
		internal_product_id: full.internal_id,
		status: CusProductStatus.Active,
		created_at: Date.now(),
		starts_at: Date.now(),
		quantity: 1,
		options: [],
		is_custom: false,
	});

	return { customerId, internalCustomerId, cusProductId };
};

/** One reward referencing the plan via BOTH free_product_id and discount_config. */
export const seedRewardProgramRef = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}) => {
	const rewardId = uniqueTestId("cv2_rew");
	const internalRewardId = generateId("rew");
	const programId = uniqueTestId("cv2_rp");
	const internalProgramId = generateId("rp");

	await ctx.db.insert(rewards).values({
		internal_id: internalRewardId,
		id: rewardId,
		org_id: ctx.org.id,
		env: ctx.env,
		created_at: Date.now(),
		name: rewardId,
		type: RewardType.PercentageDiscount,
		free_product_id: planId,
		discount_config: {
			discount_value: 10,
			duration_type: CouponDurationType.OneOff,
			duration_value: 1,
			apply_to_all: false,
			product_ids: [planId],
		},
	});

	await ctx.db.insert(rewardPrograms).values({
		internal_id: internalProgramId,
		id: programId,
		org_id: ctx.org.id,
		env: ctx.env,
		created_at: Date.now(),
		internal_reward_id: internalRewardId,
		product_ids: [planId],
		when: RewardTriggerEvent.Checkout,
		max_redemptions: 1,
		unlimited_redemptions: false,
		exclude_trial: false,
	});

	return { rewardId, programId, internalRewardId, internalProgramId };
};

export const seedRevenueCatMappingRef = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}) => {
	await ctx.db.insert(revenuecatMappings).values({
		org_id: ctx.org.id,
		env: ctx.env,
		autumn_product_id: planId,
		revenuecat_product_ids: [`rc_${planId}`],
	});
};

export const deleteRevenueCatMappingRefs = async ({
	ctx,
	planIds,
}: {
	ctx: AutumnContext;
	planIds: string[];
}) => {
	for (const planId of planIds) {
		await ctx.db
			.delete(revenuecatMappings)
			.where(
				and(
					eq(revenuecatMappings.org_id, ctx.org.id),
					eq(revenuecatMappings.env, ctx.env),
					eq(revenuecatMappings.autumn_product_id, planId),
				),
			);
	}
};

export const cleanupRefs = async ({
	ctx,
	planIds,
	rewardId,
	programId,
}: {
	ctx: AutumnContext;
	planIds: string[];
	rewardId?: string;
	programId?: string;
}) => {
	if (programId) {
		await ctx.db.delete(rewardPrograms).where(eq(rewardPrograms.id, programId));
	}
	if (rewardId) {
		await ctx.db.delete(rewards).where(eq(rewards.id, rewardId));
	}

	await deleteRevenueCatMappingRefs({ ctx, planIds });

	for (const planId of planIds) {
		const cusProds = await ctx.db
			.select()
			.from(customerProducts)
			.where(eq(customerProducts.product_id, planId));

		for (const row of cusProds) {
			await ctx.db
				.delete(customerProducts)
				.where(eq(customerProducts.id, row.id));
			await ctx.db
				.delete(customers)
				.where(eq(customers.internal_id, row.internal_customer_id));
		}
	}
};
