import {
	CouponDurationType,
	CusProductStatus,
	customerProducts,
	customers,
	RewardTriggerEvent,
	RewardType,
	rewardPrograms,
	rewards,
} from "@autumn/shared";
import { cleanupPlanCustomerRefs } from "@tests/integration/catalog-v2/plans/utils/cleanupPlanCustomerRefs.js";
import { deleteDbPlans } from "@tests/integration/catalog-v2/plans/utils/expectCatalogPlans.js";
import { deleteDbFeatures } from "@tests/integration/catalog-v2/utils/expectCatalogFeatures.js";
import { getFullLicenseProduct } from "@tests/integration/licenses/catalog-update/utils/getFullLicenseProduct.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerLicenseRepo } from "@/internal/licenses/repos/customerLicenseRepo.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { generateId } from "@/utils/genUtils.js";

export const logPlaybook = ({
	title,
	steps,
}: {
	title: string;
	steps: string[];
}) => {
	console.log(chalk.green(`\n[catalog-qa] ${title}`));
	for (const [index, step] of steps.entries()) {
		console.log(chalk.yellow(`  ${index + 1}. ${step}`));
	}
	console.log(chalk.dim("  Re-run this file after a destructive click.\n"));
};

export const resetCatalogPlans = async ({
	ctx,
	planIds,
}: {
	ctx: AutumnContext;
	planIds: string[];
}) => {
	await cleanupPlanCustomerRefs({ ctx, planIds });
	await deleteDbPlans({ ctx, planIds });
};

export const resetCatalogFeatures = async ({
	ctx,
	featureIds,
}: {
	ctx: AutumnContext;
	featureIds: string[];
}) => {
	await deleteDbFeatures({ ctx, featureIds });
};

export const deleteNamedCustomers = async ({
	ctx,
	customerIds,
}: {
	ctx: AutumnContext;
	customerIds: string[];
}) => {
	for (const customerId of customerIds) {
		const rows = await ctx.db
			.select()
			.from(customers)
			.where(
				and(
					eq(customers.id, customerId),
					eq(customers.org_id, ctx.org.id),
					eq(customers.env, ctx.env),
				),
			);
		for (const row of rows) {
			await ctx.db
				.delete(customerProducts)
				.where(eq(customerProducts.internal_customer_id, row.internal_id));
			await ctx.db
				.delete(customers)
				.where(eq(customers.internal_id, row.internal_id));
		}
	}
};

export const seedNamedCustomer = async ({
	ctx,
	planId,
	customerId,
	name,
	version,
	status = CusProductStatus.Active,
	isCustom = false,
}: {
	ctx: AutumnContext;
	planId: string;
	customerId: string;
	name: string;
	version?: number;
	status?: CusProductStatus;
	isCustom?: boolean;
}) => {
	await deleteNamedCustomers({ ctx, customerIds: [customerId] });
	const full = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});
	const internalCustomerId = generateId("cus");
	const cusProductId = generateId("cus_prod");
	await ctx.db.insert(customers).values({
		internal_id: internalCustomerId,
		id: customerId,
		org_id: ctx.org.id,
		env: ctx.env,
		created_at: Date.now(),
		name,
		email: `${customerId}@qa.autumn.dev`,
	});
	await ctx.db.insert(customerProducts).values({
		id: cusProductId,
		internal_customer_id: internalCustomerId,
		product_id: planId,
		internal_product_id: full.internal_id,
		status,
		created_at: Date.now(),
		starts_at: Date.now(),
		quantity: 1,
		options: [],
		is_custom: isCustom,
	});
	return { customerId, internalCustomerId, cusProductId };
};

export const seedRewardOnPlan = async ({
	ctx,
	planId,
	rewardId,
	programId,
}: {
	ctx: AutumnContext;
	planId: string;
	rewardId: string;
	programId: string;
}) => {
	await ctx.db.delete(rewardPrograms).where(eq(rewardPrograms.id, programId));
	await ctx.db.delete(rewards).where(eq(rewards.id, rewardId));
	const internalRewardId = generateId("rew");
	await ctx.db.insert(rewards).values({
		internal_id: internalRewardId,
		id: rewardId,
		org_id: ctx.org.id,
		env: ctx.env,
		created_at: Date.now(),
		name: "QA Reward",
		type: RewardType.PercentageDiscount,
		discount_config: {
			discount_value: 10,
			duration_type: CouponDurationType.OneOff,
			duration_value: 1,
			apply_to_all: false,
			product_ids: [planId],
		},
	});
	await ctx.db.insert(rewardPrograms).values({
		internal_id: generateId("rp"),
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
};

export const seedAssignedSeat = async ({
	ctx,
	parentId,
	childId,
	customerId,
	name,
}: {
	ctx: AutumnContext;
	parentId: string;
	childId: string;
	customerId: string;
	name: string;
}) => {
	const seeded = await seedNamedCustomer({
		ctx,
		planId: parentId,
		customerId,
		name,
	});
	const linked = await getFullLicenseProduct({
		ctx,
		parentPlanId: parentId,
		licensePlanId: childId,
	});
	const customerLicense = await customerLicenseRepo.upsertGranted({
		db: ctx.db,
		internalCustomerId: seeded.internalCustomerId,
		parentCustomerProductId: seeded.cusProductId,
		licenseInternalProductId: linked.planLicense.license_internal_product_id,
		planLicenseId: linked.planLicense.id,
		granted: linked.planLicense.included,
	});
	return {
		...seeded,
		customerLicenseId: customerLicense.id,
		planLicenseId: linked.planLicense.id,
	};
};
