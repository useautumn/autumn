import {
  AppEnv,
  CusProductStatus,
  Customer,
  ErrCode,
  FullRewardProgram,
  ReferralCode,
  Reward,
  RewardCategory,
  RewardReceivedBy,
  RewardRedemption,
} from "@autumn/shared";

import { CusService } from "../customers/CusService.js";
import { createStripeCusIfNotExists } from "@/external/stripe/stripeCusUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import Stripe from "stripe";
import { RewardRedemptionService } from "./RewardRedemptionService.js";
import { ProductService } from "../products/ProductService.js";
import { createFullCusProduct } from "../customers/add-product/createFullCusProduct.js";
import { InsertCusProductParams } from "../customers/cusProducts/AttachParams.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { CusProductService } from "../customers/cusProducts/CusProductService.js";
import RecaseError from "@/utils/errorUtils.js";
import { StatusCodes } from "http-status-codes";
import { getRewardCat } from "./rewardUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { deleteCusCache } from "../customers/cusCache/updateCachedCus.js";
import { RewardProgramService } from "./RewardProgramService.js";

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
  referralCode: ReferralCode;
  reward: Reward;
  redemption: RewardRedemption;
}) => {
  logger.info(
    `Triggering redemption ${redemption.id} for referral code ${referralCode.code}`
  );

  const referrer = await CusService.getByInternalId({
    db,
    internalId: referralCode.internal_customer_id,
  });

  const redeemer = await CusService.getByInternalId({
    db,
    internalId: redemption.internal_customer_id,
  });

  const rewardProgram = await RewardProgramService.get({
    db,
    orgId: org.id,
    env,
    id: referralCode.internal_reward_program_id!,
  });

  if (!rewardProgram) {
    throw new RecaseError({
      message: `Reward program ${referralCode.internal_reward_program_id} not found`,
      code: ErrCode.RewardProgramNotFound,
      statusCode: StatusCodes.NOT_FOUND,
    });
  }

  for (let i = 0; i < 2; i++) {
    let customer = i === 0 ? referrer : redeemer;

    let stripeCli = createStripeCli({
      org,
      env,
      legacyVersion: true,
    });

    await createStripeCusIfNotExists({
      db,
      customer: applyToCustomer,
      org,
      env,
      logger,
    });

    let stripeCusId = applyToCustomer.processor.id;
    let stripeCus = (await stripeCli.customers.retrieve(
      stripeCusId
    )) as Stripe.Customer;

    let applied = false;

    if (!stripeCus.discount) {
      await stripeCli.customers.update(stripeCusId, {
        // @ts-ignore
        coupon: reward.id,
      });

      applied = true;
      logger.info(`Applied coupon to customer in Stripe`);
    }

    let updatedRedemption = await RewardRedemptionService.update({
      db,
      id: redemption.id,
      updates: {
        applied,
        triggered: true,
      },
    });

    logger.info(`Successfully triggered redemption, applied: ${applied}`);

    return updatedRedemption;
  }

  // let applyToCustomer = await CusService.getByInternalId({
  //   db,
  //   internalId: referralCode.internal_customer_id,
  // });
};

export const triggerFreeProduct = async ({
  req,
  db,
  referralCode,
  redeemer,
  redemption,
  rewardProgram,
  org,
  env,
  logger,
}: {
  req?: ExtendedRequest;
  db: DrizzleCli;
  referralCode: ReferralCode;
  redeemer: Customer;
  redemption: RewardRedemption;
  rewardProgram: FullRewardProgram;
  org: any;
  env: AppEnv;
  logger: any;
}) => {
  logger.info(`Triggering free product reward`);
  let { received_by } = rewardProgram;

  let addToRedeemer = received_by === RewardReceivedBy.All;
  let addToReferrer =
    received_by === RewardReceivedBy.Referrer ||
    received_by === RewardReceivedBy.All;

  let productId = rewardProgram.reward.free_product_id!;

  let fullProduct = await ProductService.getFull({
    db,
    idOrInternalId: productId,
    orgId: org.id,
    env,
  });

  if (!fullProduct) {
    throw new RecaseError({
      message: `Product ${productId} not found`,
      code: ErrCode.ProductNotFound,
      statusCode: StatusCodes.NOT_FOUND,
    });
  }

  let referrer = await CusService.getByInternalId({
    db,
    internalId: referralCode.internal_customer_id,
  });

  if (!referrer) {
    throw new RecaseError({
      message: `Referrer ${referralCode.internal_customer_id} not found`,
      code: ErrCode.CustomerNotFound,
      statusCode: StatusCodes.NOT_FOUND,
    });
  }

  let [fullReferrer, fullRedeemer] = await Promise.all([
    CusService.getFull({
      db,
      idOrInternalId: referrer.id!,
      orgId: org.id,
      env,
    }),
    CusService.getFull({
      db,
      idOrInternalId: redeemer.id!,
      orgId: org.id,
      env,
    }),
  ]);

  let attachParams: InsertCusProductParams = {
    req,
    org,
    product: fullProduct,
    prices: fullProduct.prices,
    entitlements: fullProduct.entitlements,
    optionsList: [],
    entities: [],
    freeTrial: null,
    features: [],
    customer: fullReferrer,
    cusProducts: fullReferrer.customer_products,
    replaceables: [],
  };

  if (addToRedeemer) {
    let redeemerAttachParams = structuredClone({
      ...attachParams,
      customer: fullRedeemer,
      cusProducts: fullRedeemer.customer_products,
    });

    await createFullCusProduct({
      db,
      attachParams: redeemerAttachParams,
      logger,
    });
    logger.info(`✅ Added ${fullProduct.name} to redeemer`);

    await deleteCusCache({
      db,
      customerId: fullRedeemer.id!,
      org,
      env,
    });
  }

  if (addToReferrer) {
    await createFullCusProduct({
      db,
      attachParams: {
        ...attachParams,
        customer: fullReferrer,
        cusProducts: fullReferrer.customer_products,
      },
      logger,
    });
    await deleteCusCache({
      db,
      customerId: fullReferrer.id!,
      org,
      env,
    });
    logger.info(`✅ Added ${fullProduct.name} to referrer`);
  }

  await RewardRedemptionService.update({
    db,
    id: redemption.id,
    updates: {
      triggered: true,
      applied: true,
    },
  });
};
