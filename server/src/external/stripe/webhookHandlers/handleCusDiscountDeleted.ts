import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { RewardRedemptionService } from "@/internal/rewards/RewardRedemptionService.js";
import { RewardService } from "@/internal/rewards/RewardService.js";
import { notNullish } from "@/utils/genUtils.js";
import type { StripeWebhookContext } from "../webhookMiddlewares/stripeWebhookContext";

export async function handleCusDiscountDeleted({
	ctx,
}: {
	ctx: StripeWebhookContext;
}) {
	const { db, logger, fullCustomer, org, env, stripeEvent, stripeCli } = ctx;
	if (!fullCustomer) {
		logger.warn(`discount.deleted: autumn customer not found`);
		return;
	}

	// TODO: Fix this.
	const discount = stripeEvent.data.object as any;

	// Check if any redemptions available, and apply to customer if so
	const redemptions = await RewardRedemptionService.getUnappliedRedemptions({
		db,
		internalCustomerId: fullCustomer.internal_id,
	});

	logger.info(
		`discount.deleted:, discount ID: ${discount.id}, found ${redemptions.length} redemptions`,
	);

	if (redemptions.length === 0) return;

	const paidProductRedemption = redemptions.find(
		(r) =>
			r.reward_program.reward.id ===
			(typeof discount.coupon === "string"
				? discount.coupon
				: discount.coupon.id),
	);

	if (discount.subscription) {
		logger.info(
			`Discount is a subscription, paidProductRedemption: ${paidProductRedemption?.id}`,
		);

		if (!paidProductRedemption) return;

		// Mark reward redemption as applied / redeemer applied to true
		const sub = await stripeCli.subscriptions.retrieve(discount.subscription);

		// can't really test because it modifies subscription affected by test clock...
		try {
			await stripeCli.subscriptions.update(discount.subscription, {
				discounts: [
					...(sub.discounts as string[]).map((d: string) => ({
						discount: d,
					})),
					{
						coupon: paidProductRedemption.reward_program.reward.id as string,
					},
				],
			});
		} catch (error: any) {
			logger.error(
				`Failed to update subscription ${discount.subscription} with paid product coupon, error: ${error.message}`,
			);
			throw error;
		}

		// Mark reward redemption as applied / redeemer applied to true
		const isReferrer =
			paidProductRedemption.referral_code.internal_customer_id ===
			fullCustomer.internal_id;

		await RewardRedemptionService.update({
			db,
			id: paidProductRedemption.id,
			updates: {
				applied: isReferrer ? true : undefined,
				redeemer_applied: isReferrer ? undefined : true,
			},
		});

		return;
	}

	const redemption = redemptions[0];

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
		coupon: reward.id,
	});

	await RewardRedemptionService.update({
		db,
		id: redemption.id,
		updates: {
			applied: true,
		},
	});

	logger.info(
		`discount.deleted: applied reward ${reward.name} on customer ${fullCustomer.name} (${fullCustomer.id})`,
	);
	logger.info(`Redemption ID: ${redemption.id}`);
}
