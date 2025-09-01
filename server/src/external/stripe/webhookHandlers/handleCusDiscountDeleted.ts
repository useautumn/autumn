import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { CusService } from "@/internal/customers/CusService.js";
import { RewardRedemptionService } from "@/internal/rewards/RewardRedemptionService.js";
import { RewardService } from "@/internal/rewards/RewardService.js";
import { notNullish } from "@/utils/genUtils.js";
import { createStripeCli } from "../utils.js";

export async function handleCusDiscountDeleted({
	db,
	org,
	discount,
	env,
	logger,
	res,
}: {
	db: DrizzleCli;
	org: any;
	discount: any;
	env: any;
	logger: any;
	res: any;
}) {
	const customer = await CusService.getByStripeId({
		db,
		stripeId: discount.customer,
	});

	if (!customer) {
		logger.warn(`discount.deleted: customer ${discount.customer} not found`);
		return;
	}

	if (customer.env !== env || customer.org_id !== org.id) {
		logger.info(`discount.deleted: env or org mismatch, skipping`);
		return;
	}

	// Check if any redemptions available, and apply to customer if so
	const redemptions = await RewardRedemptionService.getUnappliedRedemptions({
		db,
		internalCustomerId: customer.internal_id,
	});

	logger.info(`discount.deleted: found ${redemptions.length} redemptions`);

	if (redemptions.length === 0) {
		return;
	}

	const redemption = redemptions[0];

	// Apply redemption to customer
	const stripeCli = createStripeCli({
		org,
		env,
	});

	const stripeCus = (await stripeCli.customers.retrieve(
		discount.customer,
	)) as Stripe.Customer;

	if (stripeCus && notNullish(stripeCus.discount)) {
		logger.info(
			`discount.deleted: stripe customer ${discount.customer} already has a discount`,
		);
		return;
	}

	const reward = await RewardService.get({
		db,
		orgId: org.id,
		env,
		idOrInternalId: redemption.reward_program.internal_reward_id!,
	});

	if (!reward) {
		logger.warn(
			`discount.deleted: reward ${redemption.reward_program.internal_id} not found`,
		);
		return;
	}

	const legacyStripe = createStripeCli({
		org,
		env,
		legacyVersion: true,
	});

	await legacyStripe.customers.update(discount.customer, {
		// @ts-expect-error
		coupon: reward.internal_id,
	});

	await RewardRedemptionService.update({
		db,
		id: redemption.id,
		updates: {
			applied: true,
		},
	});

	logger.info(
		`discount.deleted: applied reward ${reward.name} on customer ${customer.name} (${customer.id})`,
	);
	logger.info(`Redemption ID: ${redemption.id}`);
}
