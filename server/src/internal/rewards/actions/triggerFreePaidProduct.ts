import {
	AttachBranch,
	type Customer,
	ErrCode,
	type FullProduct,
	type FullRewardProgram,
	RecaseError,
	type ReferralCode,
	type Reward,
	type RewardRedemption,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getOrCreateStripeCustomer } from "@/external/stripe/customers";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { handleAddProduct } from "@/internal/customers/attach/attachFunctions/addProductFlow/handleAddProduct.js";
import { rewardProgramToAttachParams } from "@/internal/customers/attach/attachUtils/attachParams/convertToParams.js";
import { getCustomerSub } from "@/internal/customers/attach/attachUtils/convertAttachParams.js";
import { getDefaultAttachConfig } from "@/internal/customers/attach/attachUtils/getAttachConfig.js";
import { CusService } from "@/internal/customers/CusService.js";
import { isStripeConnected } from "@/internal/orgs/orgUtils.js";
import { redemptionRepo } from "@/internal/rewards/repos/index.js";
import {
	ReferralResponseCodes,
	receivedByRedeemer,
	receivedByReferrer,
} from "@/internal/rewards/rewardUtils.js";
import type { ExtendedRequest } from "@/utils/models/Request.js";

export const triggerFreePaidProduct = async ({
	ctx,
	req,
	referralCode,
	redeemer,
	rewardProgram,
	fullProduct,
	redemption,
}: {
	ctx: AutumnContext;
	req?: ExtendedRequest;
	referralCode: ReferralCode;
	redeemer: Customer;
	rewardProgram: FullRewardProgram & { reward: Reward };
	fullProduct: FullProduct;
	redemption: RewardRedemption;
}) => {
	const { db, org, env, logger } = ctx;
	const { received_by } = rewardProgram;

	logger.info(
		`Triggering free paid product reward for referral code ${referralCode.code}`,
	);

	const [fullReferrer, fullRedeemer] = await Promise.all([
		CusService.getFull({
			ctx,
			idOrInternalId: referralCode.internal_customer_id,
			withEntities: true,
			withSubs: true,
		}),
		CusService.getFull({
			ctx,
			idOrInternalId: redeemer.id!,
			withEntities: true,
			withSubs: true,
		}),
	]);

	if (!isStripeConnected({ org, env })) {
		throw new RecaseError({
			message: "Stripe is not connected",
			code: ErrCode.StripeConfigNotFound,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	const stripeCli = createStripeCli({ org, env });

	const applied = [false, false]; // [referrerApplied, redeemerApplied]
	for (let i = 0; i < 2; i++) {
		if (i === 0 && !receivedByReferrer(received_by)) {
			applied[i] = true;
			continue;
		}
		if (i === 1 && !receivedByRedeemer(received_by)) {
			applied[i] = true;
			continue;
		}

		const fullCus = [fullReferrer, fullRedeemer][i];
		const attachParams = rewardProgramToAttachParams({
			ctx,
			rewardProgram,
			customer: fullCus,
			product: fullProduct,
		});

		const { sub } = await getCustomerSub({ attachParams });

		if (sub) {
			logger.info(
				`Detected existing subscription for ${i === 0 ? "referrer" : "redeemer"}`,
			);
			const curDiscounts = (sub.discounts as Stripe.Discount[]) || [];

			// If coupon already applied, don't add it again
			if (
				!curDiscounts.some((d: any) => d.coupon?.id === rewardProgram.reward.id)
			) {
				logger.info(`No existing discount, adding coupon`);
				try {
					await stripeCli.subscriptions.update(sub.id, {
						discounts: [
							...curDiscounts.map((d: Stripe.Discount) => ({
								discount: d.id,
							})),
							{
								coupon: rewardProgram.reward.id,
							},
						],
					});
				} catch (error) {
					logger.error(`Error adding discount: ${error}`);
				}
				applied[i] = true;
			}
		} else {
			// Create stripe customer if not exists
			await getOrCreateStripeCustomer({
				ctx,
				customer: fullCus,
			});

			await handleAddProduct({
				ctx,
				attachParams,
				branch: AttachBranch.New,
				config: {
					...getDefaultAttachConfig(),
					requirePaymentMethod: false,
				},
			});
			applied[i] = true;
		}
	}

	const updates = {
		triggered: true,
		applied: applied?.[0] || false, // referrer applied
		redeemer_applied: applied?.[1] || false, // redeemer applied
	};

	await redemptionRepo.update({
		db,
		id: redemption.id,
		updates,
	});

	return {
		redeemer: {
			applied: true,
			cause: applied?.[0]
				? ReferralResponseCodes.Success
				: ReferralResponseCodes.OwnsProduct,
			meta: {
				id: fullRedeemer.id,
				name: fullRedeemer.name,
				email: fullRedeemer.email,
				created_at: fullRedeemer.created_at,
			},
		},
		referrer: {
			applied: true,
			cause: applied?.[1]
				? ReferralResponseCodes.Success
				: ReferralResponseCodes.OwnsProduct,
		},
	};
};
