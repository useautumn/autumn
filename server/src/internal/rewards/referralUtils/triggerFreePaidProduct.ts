import { DrizzleCli } from "@/db/initDrizzle.js";
import { createStripeCusIfNotExists } from "@/external/stripe/stripeCusUtils.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { handleAddProduct } from "@/internal/customers/attach/attachFunctions/addProductFlow/handleAddProduct.js";
import { rewardProgramToAttachParams } from "@/internal/customers/attach/attachUtils/attachParams/convertToParams.js";
import { deleteCusCache } from "@/internal/customers/cusCache/updateCachedCus.js";
import { InsertCusProductParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
  isFreeProduct,
  isOneOff,
  itemsAreOneOff,
} from "@/internal/products/productUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import {
  ReferralCode,
  RewardRedemption,
  FullRewardProgram,
  Reward,
  RewardReceivedBy,
  ErrCode,
  AttachBranch,
  FullProduct,
  Customer,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { ReferralResponseCodes } from "../referralUtils.js";
import { RewardRedemptionService } from "../RewardRedemptionService.js";
import { getCustomerSub } from "@/internal/customers/attach/attachUtils/convertAttachParams.js";
import { getDefaultAttachConfig } from "@/internal/customers/attach/attachUtils/getAttachConfig.js";
import { isStripeConnected } from "@/internal/orgs/orgUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import Stripe from "stripe";

export const receivedByReferrer = (received_by: RewardReceivedBy) => {
  return (
    received_by === RewardReceivedBy.Referrer ||
    received_by === RewardReceivedBy.All
  );
};

export const receivedByRedeemer = (received_by: RewardReceivedBy) => {
  return received_by === RewardReceivedBy.All;
};

export const triggerFreePaidProduct = async ({
  req,
  referralCode,
  redeemer,
  rewardProgram,
  fullProduct,
  redemption,
}: {
  req: ExtendedRequest;
  referralCode: ReferralCode;
  redeemer: Customer;
  rewardProgram: FullRewardProgram & { reward: Reward };
  fullProduct: FullProduct;
  redemption: RewardRedemption;
}) => {
  const { db, org, env, logger } = req;
  const { received_by } = rewardProgram;

  logger.info(
    `Triggering free paid product reward for referral code ${referralCode.code}`
  );

  const [fullReferrer, fullRedeemer] = await Promise.all([
    CusService.getFull({
      db,
      idOrInternalId: referralCode.internal_customer_id,
      orgId: org.id,
      env,
      withEntities: true,
      withSubs: true,
    }),
    CusService.getFull({
      db,
      idOrInternalId: redeemer.id!,
      orgId: org.id,
      env,
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

  // Add to referrer / redeemer
  const stripeCli = createStripeCli({ org, env });

  let applied = [false, false]; // [referrerApplied, redeemerApplied]
  for (let i = 0; i < 2; i++) {
    if (i == 0 && !receivedByReferrer(received_by)) {
      applied[i] = true;
      continue;
    }
    if (i == 1 && !receivedByRedeemer(received_by)) {
      applied[i] = true;
      continue;
    }

    const fullCus = [fullReferrer, fullRedeemer][i];
    const attachParams = rewardProgramToAttachParams({
      req,
      rewardProgram,
      customer: fullCus,
      product: fullProduct,
    });

    const { sub } = await getCustomerSub({ attachParams });

    if (sub) {
      const curDiscounts = (sub.discounts as Stripe.Discount[]) || [];

      // If coupon already applied, don't add it again
      if (
        curDiscounts.some((d: any) => d.coupon?.id === rewardProgram.reward.id)
      ) {
      } else {
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
        applied[i] = true;
      }
    } else {
      // Create stripe customer if not exists
      await createStripeCusIfNotExists({
        db,
        customer: fullCus,
        org,
        env,
        logger,
      });

      await handleAddProduct({
        req,
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

  await RewardRedemptionService.update({
    db,
    id: redemption.id,
    updates,
  });

  return {
    redeemer: {
      applied: true,
      cause: true
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
      cause: true
        ? ReferralResponseCodes.Success
        : ReferralResponseCodes.OwnsProduct,
    },
  };
};
