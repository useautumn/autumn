import { DrizzleCli } from "@/db/initDrizzle.js";
import { createFullCusProduct } from "@/internal/customers/add-product/createFullCusProduct.js";
import { deleteCusCache } from "@/internal/customers/cusCache/updateCachedCus.js";
import { InsertCusProductParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { CusService } from "@/internal/customers/CusService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { isFreeProduct, isOneOff } from "@/internal/products/productUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import {
  ReferralCode,
  RewardRedemption,
  FullRewardProgram,
  Reward,
  RewardReceivedBy,
  ErrCode,
} from "@autumn/shared";
import { Customer, AppEnv } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { ReferralResponseCodes } from "../referralUtils.js";
import { RewardRedemptionService } from "../RewardRedemptionService.js";
import { triggerFreePaidProduct } from "./triggerFreePaidProduct.js";

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
  rewardProgram: FullRewardProgram & { reward: Reward };
  org: any;
  env: AppEnv;
  logger: any;
}) => {
  logger.info(`Triggering free product reward`);
  const { received_by } = rewardProgram;

  let addToRedeemer = received_by === RewardReceivedBy.All;
  let addToReferrer =
    received_by === RewardReceivedBy.Referrer ||
    received_by === RewardReceivedBy.All;

  const productId = rewardProgram.reward.free_product_id!;

  const fullProduct = await ProductService.getFull({
    db,
    idOrInternalId: productId,
    orgId: org.id,
    env,
  });

  function seedReq(req?: ExtendedRequest) {
    // Seed in properties that aren't usually present dependent on the trigger type
    return {
      ...(req || {}),
      db: req?.db ? req.db : db,
      org: req?.org ? req.org : org,
      env: req?.env ? req.env : env,
      logger: req?.logger ? req.logger : logger,
      logtail: req?.logtail ? req.logtail : logger,
    } as ExtendedRequest;
  }

  if (!isFreeProduct(fullProduct.prices) && !isOneOff(fullProduct.prices)) {
    req = seedReq(req);
    return await triggerFreePaidProduct({
      req,
      referralCode,
      redeemer,
      rewardProgram,
      fullProduct,
      redemption,
    });
  }

  // const isPaidProduct = !isFreeProduct(fullProduct.prices);
  // const isRecurring =
  //   !isOneOff(fullProduct.prices) && !itemsAreOneOff(fullProduct.entitlements);

  if (!fullProduct) {
    throw new RecaseError({
      message: `Product ${productId} not found`,
      code: ErrCode.ProductNotFound,
      statusCode: StatusCodes.NOT_FOUND,
    });
  }

  const [fullReferrer, fullRedeemer] = await Promise.all([
    CusService.getFull({
      db,
      idOrInternalId: referralCode.internal_customer_id,
      orgId: org.id,
      env,
      allowNotFound: true,
    }),
    CusService.getFull({
      db,
      idOrInternalId: redeemer.id!,
      orgId: org.id,
      env,
    }),
  ]);

  if (!fullReferrer) {
    throw new RecaseError({
      message: `Referrer (internal ID: ${referralCode.internal_customer_id}) not found`,
      code: ErrCode.CustomerNotFound,
      statusCode: StatusCodes.NOT_FOUND,
    });
  }

  // // If they already have the product, don't add to them
  // if (fullReferrer.customer_products.find((cp) => cp.product.id === productId))
  //   addToReferrer = false;
  // if (fullRedeemer.customer_products.find((cp) => cp.product.id === productId))
  //   addToRedeemer = false;

  // // If they are on any paid plan that isn't an add-on, and the reward isn't an, don't add to them
  // if (
  //   fullReferrer.customer_products.some(
  //     (x) =>
  //       !x.product.is_add_on &&
  //       !isFreeProduct(x.customer_prices.map((y) => y.price))
  //   ) &&
  //   !fullProduct.is_add_on
  // )
  //   addToReferrer = false;
  // if (
  //   fullRedeemer.customer_products.some(
  //     (x) =>
  //       !x.product.is_add_on &&
  //       !isFreeProduct(x.customer_prices.map((y) => y.price))
  //   ) &&
  //   !fullProduct.is_add_on
  // )
  //   addToRedeemer = false;

  // Branch 1: Free add-on product or non-recurring product
  // logger.info(`Branch 1: ${isPaidProduct ? "Paid" : "Free"} add-on product`);

  const attachParams: InsertCusProductParams = {
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
    const redeemerAttachParams = {
      ...structuredClone(attachParams),
      customer: fullRedeemer,
      cusProducts: fullRedeemer.customer_products,
    };

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
        ...structuredClone(attachParams),
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

  return {
    redeemer: {
      applied: addToRedeemer,
      cause: addToRedeemer
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
      applied: addToReferrer,
      cause: addToReferrer
        ? ReferralResponseCodes.Success
        : ReferralResponseCodes.OwnsProduct,
    },
  };

  // if (isPaidProduct) {
  //   logger.info(`Branch 2: Paid product from Customer Redemption`);
  //   if (!req) {
  //     req = {
  //       db,
  //       org,
  //       env,
  //       logger,
  //       logtail: logger,
  //     } as ExtendedRequest;
  //   }
  //   req = seedReq(req);

  //   const ensureStripeIDs = [
  //     !fullRedeemer.processor?.id &&
  //       (await createStripeCusIfNotExists({
  //         db,
  //         customer: fullRedeemer,
  //         org,
  //         env,
  //         logger,
  //       })),
  //     !fullReferrer.processor?.id &&
  //       (await createStripeCusIfNotExists({
  //         db,
  //         customer: fullReferrer,
  //         org,
  //         env,
  //         logger,
  //       })),
  //   ];

  //   // Update customers with new Stripe IDs if they were created
  //   const updatedIDs = await Promise.all(ensureStripeIDs);
  //   if (updatedIDs[0]) fullRedeemer.processor.id = updatedIDs[0].id;
  //   if (updatedIDs[1]) fullReferrer.processor.id = updatedIDs[1].id;

  //   const executions = [
  //     addToRedeemer &&
  //       (await handleAddProduct({
  //         req,
  //         attachParams: rewardProgramToAttachParams({
  //           req,
  //           rewardProgram: rewardProgram,
  //           customer: fullRedeemer,
  //           product: fullProduct,
  //           org,
  //         }),
  //         branch: AttachBranch.New,
  //       })),
  //     addToReferrer &&
  //       (await handleAddProduct({
  //         req,
  //         attachParams: rewardProgramToAttachParams({
  //           req,
  //           rewardProgram: rewardProgram,
  //           customer: fullReferrer,
  //           product: fullProduct,
  //           org,
  //         }),
  //         branch: AttachBranch.New,
  //       })),
  //   ];

  //   const results = await Promise.allSettled(executions);
  //   const redeemerCause = !addToRedeemer
  //     ? ReferralResponseCodes.OwnsProduct
  //     : results[0]?.status === "fulfilled"
  //       ? ReferralResponseCodes.Success
  //       : ReferralResponseCodes.InternalError;
  //   const referrerCause = !addToReferrer
  //     ? ReferralResponseCodes.OwnsProduct
  //     : results[1]?.status === "fulfilled"
  //       ? ReferralResponseCodes.Success
  //       : ReferralResponseCodes.InternalError;
  //   const appliedToRedeemer =
  //     addToRedeemer && results[0]?.status === "fulfilled";
  //   const appliedToReferrer =
  //     addToReferrer && results[1]?.status === "fulfilled";

  //   if (results.every((result) => result.status === "fulfilled")) {
  //     await RewardRedemptionService.update({
  //       db,
  //       id: redemption.id,
  //       updates: {
  //         triggered: true,
  //         applied: true,
  //       },
  //     });
  //   } else {
  //     logger.error(`Error in executions: ${results}`);
  //   }

  //   return {
  //     redeemer: {
  //       applied: appliedToRedeemer,
  //       cause: redeemerCause,
  //       meta: {
  //         id: fullRedeemer.id,
  //         name: fullRedeemer.name,
  //         email: fullRedeemer.email,
  //         created_at: fullRedeemer.created_at,
  //       },
  //     },
  //     referrer: { applied: appliedToReferrer, cause: referrerCause },
  //   };
  // }
  // // Branch 3: Paid product from Checkout
  // else {
  //   return {
  //     redeemer: { applied: false, cause: ReferralResponseCodes.Unknown },
  //     referrer: { applied: false, cause: ReferralResponseCodes.Unknown },
  //   };
  // }
};
