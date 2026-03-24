import {
	type CustomerEntitlement,
	type Entitlement,
	ErrCode,
	FeatureGrantDuration,
	RecaseError,
	type RewardEntitlementExpiry,
	RewardType,
} from "@autumn/shared";
import { addDays, addMonths, addWeeks, addYears } from "date-fns";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { prepareNewBalanceForInsertion } from "@/internal/balances/createBalance/prepareNewBalanceForInsertion.js";
import { deleteCachedApiCustomer } from "@/internal/customers/cusUtils/apiCusCacheUtils/deleteCachedApiCustomer.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { redemptionRepo, rewardRepo } from "@/internal/rewards/repos/index.js";
import { generateId } from "@/utils/genUtils.js";

const computeExpiresAt = ({
	expiry,
}: {
	expiry: RewardEntitlementExpiry;
}): number => {
	const now = new Date();
	switch (expiry.duration) {
		case FeatureGrantDuration.Day:
			return addDays(now, expiry.length).getTime();
		case FeatureGrantDuration.Week:
			return addWeeks(now, expiry.length).getTime();
		case FeatureGrantDuration.Month:
			return addMonths(now, expiry.length).getTime();
		case FeatureGrantDuration.Year:
			return addYears(now, expiry.length).getTime();
	}
};

/** Redeem a promo code and grant loose entitlements to a customer */
export const redeemPromoCode = async ({
	ctx,
	code,
	customerId,
}: {
	ctx: AutumnContext;
	code: string;
	customerId: string;
}) => {
	const { db, org, env, logger } = ctx;

	// 1. Find the reward matching this promo code
	const rewards = await rewardRepo.getByIdOrCode({
		db,
		codes: [code],
		orgId: org.id,
		env,
	});

	if (!rewards.length) {
		throw new RecaseError({
			message: `No reward found for code "${code}"`,
			code: ErrCode.RewardNotFound,
			statusCode: 404,
		});
	}

	const reward = rewards[0];

	if (reward.type !== RewardType.FeatureGrant) {
		throw new RecaseError({
			message: `Reward "${reward.id}" is not a feature grant reward`,
			code: ErrCode.InvalidReward,
			statusCode: 400,
		});
	}

	if (!reward.entitlements?.length) {
		throw new RecaseError({
			message: `Reward "${reward.id}" has no entitlements configured`,
			code: ErrCode.InvalidReward,
			statusCode: 400,
		});
	}

	// 2. Find the matching promo code and check its max_redemptions
	const promoCode = reward.promo_codes?.flat().find((pc) => pc.code === code);
	if (!promoCode) {
		throw new RecaseError({
			message: `Promo code "${code}" not found on reward "${reward.id}"`,
			code: ErrCode.RewardNotFound,
			statusCode: 404,
		});
	}

	if (promoCode.max_redemptions) {
		const redemptionCount = await redemptionRepo.getPromoCodeRedemptionCount({
			db,
			rewardInternalId: reward.internal_id,
		});

		if (redemptionCount >= promoCode.max_redemptions) {
			throw new RecaseError({
				message: `Promo code "${code}" has reached its maximum redemptions`,
				code: ErrCode.ReferralCodeMaxRedemptionsReached,
				statusCode: 400,
			});
		}
	}

	// 3. Fetch customer
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	// 4. Check if customer already redeemed this reward
	const existingRedemption = await redemptionRepo.getByCustomerAndReward({
		db,
		internalCustomerId: fullCustomer.internal_id,
		rewardInternalId: reward.internal_id,
	});

	if (existingRedemption) {
		throw new RecaseError({
			message: `Customer "${customerId}" has already redeemed this reward`,
			code: ErrCode.CustomerAlreadyRedeemedReferralCode,
			statusCode: 400,
		});
	}

	// 5. Create entitlements for each reward entitlement config
	const newEntitlements: Entitlement[] = [];
	const newCustomerEntitlements: CustomerEntitlement[] = [];

	for (const rewardEnt of reward.entitlements) {
		const feature = ctx.features.find(
			(f) => f.internal_id === rewardEnt.internal_feature_id,
		);

		if (!feature) {
			logger.warn(
				`Feature with internal_id "${rewardEnt.internal_feature_id}" not found, skipping`,
			);
			continue;
		}

		const expiresAt = rewardEnt.expiry
			? computeExpiresAt({ expiry: rewardEnt.expiry })
			: undefined;

		const { newEntitlement, newCustomerEntitlement } =
			await prepareNewBalanceForInsertion({
				ctx,
				fullCustomer,
				feature,
				params: {
					customer_id: customerId,
					feature_id: feature.id,
					included_grant: rewardEnt.allowance,
					expires_at: expiresAt,
				},
			});

		newEntitlements.push(newEntitlement);
		newCustomerEntitlements.push(newCustomerEntitlement);
	}

	if (!newEntitlements.length) {
		throw new RecaseError({
			message:
				"No valid entitlements could be created from reward configuration",
			code: ErrCode.InvalidReward,
			statusCode: 400,
		});
	}

	// 6. Insert entitlements and customer_entitlements
	await EntitlementService.insert({
		db,
		data: newEntitlements,
	});

	await CusEntService.insert({
		ctx,
		data: newCustomerEntitlements,
	});

	// 6.5. Clear cached customer so subsequent /check calls see the new entitlements
	await deleteCachedApiCustomer({
		customerId,
		ctx,
		source: "redeemPromoCode",
	});

	logger.info(
		`Granted ${newEntitlements.length} entitlement(s) to customer "${customerId}" via promo code "${code}"`,
	);

	// 7. Record the redemption
	await redemptionRepo.insert({
		db,
		rewardRedemption: {
			id: generateId("rr"),
			internal_customer_id: fullCustomer.internal_id,
			reward_internal_id: reward.internal_id,
			referral_code_id: null,
			internal_reward_program_id: null,
			triggered: true,
			applied: true,
			redeemer_applied: true,
			created_at: Date.now(),
			updated_at: Date.now(),
		},
	});

	// 8. Return result
	return {
		reward_id: reward.id,
		entitlements_granted: reward.entitlements.map((ent) => {
			const feature = ctx.features.find(
				(f) => f.internal_id === ent.internal_feature_id,
			);
			return {
				feature_id: feature?.id ?? ent.internal_feature_id,
				balance: ent.allowance,
			};
		}),
	};
};
