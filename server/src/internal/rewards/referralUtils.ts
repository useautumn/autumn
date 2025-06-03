import {
  AppEnv,
  CusProductStatus,
  Customer,
  ErrCode,
  FullRewardProgram,
  ReferralCode,
  Reward,
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
    `Triggering redemption ${redemption.id} for referral code ${referralCode.code}`,
  );

  let applyToCustomer = await CusService.getByInternalId({
    db,
    internalId: referralCode.internal_customer_id,
  });

  if (!applyToCustomer) {
    throw new RecaseError({
      message: `Customer ${referralCode.internal_customer_id} not found`,
      code: ErrCode.CustomerNotFound,
      statusCode: StatusCodes.NOT_FOUND,
    });
  }

  let stripeCli = createStripeCli({
    org,
    env,
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
    stripeCusId,
  )) as Stripe.Customer;

  let applied = false;
  if (!stripeCus.discount) {
    await stripeCli.customers.update(stripeCusId, {
      coupon: reward.internal_id,
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
};

export const triggerFreeProduct = async ({
  db,
  referralCode,
  redeemer,
  redemption,
  rewardProgram,
  org,
  env,
  logger,
}: {
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

  logger.info(`Referrer: ${referrer.name} (${referrer.id})`);

  let [redeemerCusProducts, referrerCusProducts] = await Promise.all([
    CusProductService.list({
      db,
      internalCustomerId: redeemer.internal_id,
      inStatuses: [CusProductStatus.Active],
    }),
    CusProductService.list({
      db,
      internalCustomerId: referrer.internal_id,
      inStatuses: [CusProductStatus.Active],
    }),
  ]);

  let attachParams: InsertCusProductParams = {
    org,
    product: fullProduct,
    prices: fullProduct.prices,
    entitlements: fullProduct.entitlements,
    optionsList: [],
    entities: [],
    freeTrial: null,
    features: [],
    customer: referrer,
    cusProducts: referrerCusProducts,
  };

  if (addToRedeemer) {
    let redeemerAttachParams = structuredClone({
      ...attachParams,
      customer: redeemer,
      cusProducts: redeemerCusProducts,
    });

    await createFullCusProduct({
      db,
      attachParams: redeemerAttachParams,
      logger,
    });
    logger.info(`✅ Added ${fullProduct.name} to redeemer`);
  }

  if (addToReferrer) {
    await createFullCusProduct({
      db,
      attachParams: {
        ...attachParams,
        customer: referrer,
        cusProducts: referrerCusProducts,
      },
      logger,
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
