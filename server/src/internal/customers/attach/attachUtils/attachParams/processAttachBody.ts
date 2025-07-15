import { ExtendedRequest } from "@/utils/models/Request.js";
import { AttachBody } from "@autumn/shared";
import { createStripeCli } from "@/external/stripe/utils.js";
import { getStripeCusData } from "./attachParamsUtils/getStripeCusData.js";
import { getPricesAndEnts } from "./attachParamsUtils/getPricesAndEnts.js";
import { getCustomerAndProducts } from "./attachParamsUtils/getCusAndProducts.js";
import { RewardService } from "@/internal/rewards/RewardService.js";
import RecaseError from "@/utils/errorUtils.js";
import { ErrCode } from "@autumn/shared";
import Stripe from "stripe";

export const getReward = async ({
  req,
  attachBody,
  stripeCli,
}: {
  req: ExtendedRequest;
  attachBody: AttachBody;
  stripeCli: Stripe;
}) => {
  const { reward: idOrCode } = attachBody;
  if (!idOrCode) {
    return undefined;
  }

  // 1. Get reward by id or promo code
  const reward = await RewardService.getByIdOrCode({
    db: req.db,
    idOrCode,
    orgId: req.org.id,
    env: req.env,
  });

  if (!reward) {
    throw new RecaseError({
      message: `Reward ${idOrCode} not found`,
      code: ErrCode.RewardNotFound,
      statusCode: 404,
    });
  }

  const stripeCoupon = await stripeCli.coupons.retrieve(reward.id);

  return {
    reward,
    stripeCoupon,
  };
};

export const processAttachBody = async ({
  req,
  attachBody,
}: {
  req: ExtendedRequest;
  attachBody: AttachBody;
}) => {
  // 1. Get customer and products
  const { org, env } = req;

  if (!org.stripe_connected) {
    throw new RecaseError({
      message: "Please connect to Stripe to add products",
      code: ErrCode.StripeConfigNotFound,
      statusCode: 400,
    });
  }

  const { customer, products } = await getCustomerAndProducts({
    req,
    attachBody,
  });

  const stripeCli = createStripeCli({ org, env });
  const [stripeCusData, rewardData] = await Promise.all([
    getStripeCusData({
      stripeCli,
      db: req.db,
      org,
      env,
      customer,
      logger: req.logtail,
    }),
    getReward({
      req,
      attachBody,
      stripeCli,
    }),
  ]);

  const { stripeCus, paymentMethod, now } = stripeCusData;

  const {
    optionsList,
    prices,
    entitlements,
    freeTrial,
    customPrices,
    customEnts,
  } = await getPricesAndEnts({
    req,
    attachBody,
    customer,
    products,
  });

  return {
    customer,
    products,
    reward: rewardData?.reward,
    optionsList,
    prices,
    entitlements,
    freeTrial,
    customPrices,
    customEnts,

    // Additional data
    stripeVars: {
      stripeCli,
      stripeCus,
      paymentMethod,
      now,
    },
  };
};
