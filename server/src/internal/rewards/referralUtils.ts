import {
  type AppEnv,
  AttachBranch,
  type Customer,
  ErrCode,
  type FullRewardProgram,
  type ReferralCode,
  type Reward,
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
import type { InsertCusProductParams } from "../customers/cusProducts/AttachParams.js";
import { ProductService } from "../products/ProductService.js";
import {
  isFreeProduct,
  isOneOff,
  itemsAreOneOff,
} from "../products/productUtils.js";
import { RewardRedemptionService } from "./RewardRedemptionService.js";
import { triggerFreePaidProduct } from "./referralUtils/triggerFreePaidProduct.js";

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
  referralCode: ReferralCode;
  reward: Reward;
  redemption: RewardRedemption;
}) => {
  logger.info(
    `Triggering redemption ${redemption.id} for referral code ${referralCode.code}`
  );

  const applyToCustomer = await CusService.getByInternalId({
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

  const stripeCli = createStripeCli({
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

  const stripeCusId = applyToCustomer.processor.id;
  const stripeCus = (await stripeCli.customers.retrieve(
    stripeCusId
  )) as Stripe.Customer;

  let applied = false;
  if (!stripeCus.discount) {
    await stripeCli.customers.update(stripeCusId, {
      // @ts-expect-error
      coupon: reward.id,
    });

    applied = true;
    logger.info(`Applied coupon to customer in Stripe`);
  }

  const updatedRedemption = await RewardRedemptionService.update({
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
