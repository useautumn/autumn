import {
	ErrCode,
	type ReferralCode,
	type Reward,
	type RewardProgram,
	type RewardRedemption,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { createStripeCusIfNotExists } from "@/external/stripe/stripeCusUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import RecaseError from "@/utils/errorUtils.js";
import { CusService } from "../customers/CusService.js";
import { RewardRedemptionService } from "./RewardRedemptionService.js";
import {
	receivedByRedeemer,
	receivedByReferrer,
} from "./referralUtils/triggerFreePaidProduct.js";

export const ReferralResponseCodes = {
	OwnsProduct: "has_product_already",
	Success: "success",
	Unknown: "unknown",
	NotConfigured: "not_configured",
	InternalError: "internal_error",
};

export const generateReferralCode = () => {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	const codeLength = 6;

	let code = "";

	for (let i = 0; i < codeLength; i++) {
		code += chars.charAt(Math.floor(Math.random() * chars.length));
	}

	return code;
};

// Trigger reward
export const triggerRedemption = async ({
	ctx,
	referralCode,
	reward,
	redemption,
}: {
	ctx: AutumnContext;
	referralCode: ReferralCode & { reward_program: RewardProgram };
	reward: Reward;
	redemption: RewardRedemption;
}) => {
	const { db, org, env, logger } = ctx;

	logger.info(
		`Triggering redemption ${redemption.id} for referral code ${referralCode.code}`,
	);

	const referrer = await CusService.getByInternalId({
		db,
		internalId: referralCode.internal_customer_id,
	});

	const redeemer = await CusService.getByInternalId({
		db,
		internalId: redemption.internal_customer_id,
	});

	const rewardProgram = referralCode.reward_program;

	if (!rewardProgram) {
		throw new RecaseError({
			message: `Reward program ${referralCode.internal_reward_program_id} not found`,
			code: ErrCode.RewardProgramNotFound,
			statusCode: StatusCodes.NOT_FOUND,
		});
	}

	let applied = false;
	let redeemerApplied = false;
	for (let i = 0; i < 2; i++) {
		const customer = i === 0 ? referrer : redeemer;

		if (i === 0 && !receivedByReferrer(rewardProgram.received_by)) {
			continue;
		} else if (i === 1 && !receivedByRedeemer(rewardProgram.received_by)) {
			continue;
		}

		if (!customer) {
			throw new RecaseError({
				message: `Customer ${i === 0 ? "referrer" : "redeemer"} not found`,
				code: ErrCode.CustomerNotFound,
				statusCode: StatusCodes.NOT_FOUND,
			});
		}

		const stripeCli = createStripeCli({
			org,
			env,
			legacyVersion: true,
		});

		await createStripeCusIfNotExists({
			db,
			customer: customer,
			org,
			env,
			logger,
		});

		const stripeCusId = customer.processor.id;
		const stripeCus = (await stripeCli.customers.retrieve(
			stripeCusId,
		)) as Stripe.Customer;

		if (!stripeCus.discount) {
			await stripeCli.customers.update(stripeCusId, {
				// @ts-expect-error
				coupon: reward.id,
			});

			if (i === 0) {
				applied = true;
			} else {
				redeemerApplied = true;
			}

			logger.info(`Applied coupon to customer in Stripe`);
		}
	}

	const updatedRedemption = await RewardRedemptionService.update({
		db,
		id: redemption.id,
		updates: {
			applied,
			redeemer_applied: redeemerApplied,
			triggered: true,
		},
	});

	logger.info(`Successfully triggered redemption, applied: ${applied}`);

	return updatedRedemption;
};
