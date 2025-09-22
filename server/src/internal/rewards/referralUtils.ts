import {
	type AppEnv,
	AttachBranch,
	type Customer,
	ErrCode,
	type FullRewardProgram,
	type ReferralCode,
	type Reward,
	RewardProgram,
	RewardReceivedBy,
	type RewardRedemption,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCusIfNotExists } from "@/external/stripe/stripeCusUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import RecaseError from "@/utils/errorUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";
import { createFullCusProduct } from "../customers/add-product/createFullCusProduct.js";
import { handleAddProduct } from "../customers/attach/attachFunctions/addProductFlow/handleAddProduct.js";
import { rewardProgramToAttachParams } from "../customers/attach/attachUtils/attachParams/convertToParams.js";
import { CusService } from "../customers/CusService.js";
import { deleteCusCache } from "../customers/cusCache/updateCachedCus.js";
import { RewardProgramService } from "./RewardProgramService.js";
import type { InsertCusProductParams } from "../customers/cusProducts/AttachParams.js";
import { ProductService } from "../products/ProductService.js";
import {
	isFreeProduct,
	isOneOff,
	itemsAreOneOff,
} from "../products/productUtils.js";
import { RewardRedemptionService } from "./RewardRedemptionService.js";
import {
	receivedByRedeemer,
	receivedByReferrer,
	triggerFreePaidProduct,
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
	db,
	referralCode,
	org,
	env,
	logger,
	reward,
	redemption,
}: {
	db: DrizzleCli;
	org: any;
	env: AppEnv;
	logger: any;
	referralCode: ReferralCode & { reward_program: RewardProgram };
	reward: Reward;
	redemption: RewardRedemption;
}) => {
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
		let customer = i === 0 ? referrer : redeemer;

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

		let stripeCli = createStripeCli({
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

		let stripeCusId = customer.processor.id;
		let stripeCus = (await stripeCli.customers.retrieve(
			stripeCusId,
		)) as Stripe.Customer;

		if (!stripeCus.discount) {
			await stripeCli.customers.update(stripeCusId, {
				// @ts-ignore
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

	let updatedRedemption = await RewardRedemptionService.update({
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
