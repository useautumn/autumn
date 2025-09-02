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

export const getRewards = async ({
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

  const rewardArray = typeof idOrCode === "string" ? [idOrCode] : idOrCode;

  if (rewardArray.length === 0) {
    return undefined;
  }

  // 1. Get reward by id or promo code
  const rewards = await RewardService.getByIdOrCode({
    db: req.db,
    codes: rewardArray,
    orgId: req.org.id,
    env: req.env,
  });

  for (const reward of rewardArray) {
    const corresponding = rewards.find(
      (r) => r.id === reward || r.promo_codes.some((c) => c.code === reward)
    );

    if (!corresponding) {
      throw new RecaseError({
        message: `Reward ${reward} not found`,
        code: ErrCode.RewardNotFound,
        statusCode: 404,
      });
    }
  }

  return rewards;

  // const stripeCoupon = await stripeCli.coupons.retrieve(reward.id);

  // return {
  //   reward,
  //   stripeCoupon,
  // };
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

  const stripeCli = createStripeCli({ org, env });

  const { customer, products } = await getCustomerAndProducts({
    req,
    attachBody,
  });

  const [stripeCusData, rewardData] = await Promise.all([
    getStripeCusData({
      stripeCli,
      db: req.db,
      org,
      env,
      customer,
      logger: req.logtail,
    }),
    getRewards({
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
    rewards: rewardData,
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
