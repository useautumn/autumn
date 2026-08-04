import {
	type Customer,
	ErrCode,
	type FullRewardProgram,
	RecaseError,
	type ReferralCode,
	type Reward,
	type RewardRedemption,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { redemptionRepo } from "@/internal/rewards/repos/index.js";
import {
	ReferralResponseCodes,
	receivedByRedeemer,
	receivedByReferrer,
} from "@/internal/rewards/rewardUtils.js";
import { grantRewardEntitlements } from "./grantRewardEntitlements.js";

/** Grant a feature-grant reward's entitlements to referrer and/or redeemer */
export const triggerFeatureGrant = async ({
	ctx,
	referralCode,
	redeemer,
	redemption,
	rewardProgram,
}: {
	ctx: AutumnContext;
	referralCode: ReferralCode;
	redeemer: Customer;
	redemption: RewardRedemption;
	rewardProgram: FullRewardProgram & { reward: Reward };
}) => {
	const { db, logger } = ctx;
	const { received_by, reward } = rewardProgram;

	logger.info(
		`Triggering feature grant reward for program ${rewardProgram.id}`,
	);

	const grantToReferrer = receivedByReferrer(received_by);
	const grantToRedeemer = receivedByRedeemer(received_by);

	const [fullReferrer, fullRedeemer] = await Promise.all([
		CusService.getFull({
			ctx,
			idOrInternalId: referralCode.internal_customer_id,
			allowNotFound: true,
		}),
		CusService.getFull({ ctx, idOrInternalId: redeemer.id! }),
	]);

	if (grantToReferrer && !fullReferrer) {
		throw new RecaseError({
			message: `Referrer (internal ID: ${referralCode.internal_customer_id}) not found`,
			code: ErrCode.CustomerNotFound,
			statusCode: StatusCodes.NOT_FOUND,
		});
	}

	const balanceIdPrefix = `referral_${rewardProgram.id}`;

	// Claim the redemption first — grants insert new balances, so a retry after a
	// partial failure would double-grant whoever already succeeded
	await redemptionRepo.update({
		db,
		id: redemption.id,
		updates: {
			triggered: true,
			applied: grantToReferrer,
			redeemer_applied: grantToRedeemer,
		},
	});

	if (grantToReferrer) {
		await grantRewardEntitlements({
			ctx,
			fullCustomer: fullReferrer,
			reward,
			balanceIdPrefix,
		});
		logger.info(`Granted feature reward to referrer ${fullReferrer.id}`);
	}

	if (grantToRedeemer) {
		await grantRewardEntitlements({
			ctx,
			fullCustomer: fullRedeemer,
			reward,
			balanceIdPrefix,
		});
		logger.info(`Granted feature reward to redeemer ${fullRedeemer.id}`);
	}

	return {
		referrer: {
			applied: grantToReferrer,
			cause: grantToReferrer
				? ReferralResponseCodes.Success
				: ReferralResponseCodes.NotConfigured,
		},
		redeemer: {
			applied: grantToRedeemer,
			cause: grantToRedeemer
				? ReferralResponseCodes.Success
				: ReferralResponseCodes.NotConfigured,
			meta: {
				id: fullRedeemer.id,
				name: fullRedeemer.name,
				email: fullRedeemer.email,
				created_at: fullRedeemer.created_at,
			},
		},
	};
};
