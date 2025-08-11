import { routeHandler } from "@/utils/routerUtils.js";
import express, { Router } from "express";
import Stripe from "stripe";

import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { encryptData } from "@/utils/encryptUtils.js";

import { ErrCode } from "@/errors/errCodes.js";

import {
  checkKeyValid,
  createWebhookEndpoint,
} from "@/external/stripe/stripeOnboardingUtils.js";

import { OrgService } from "../OrgService.js";
import { AppEnv } from "@autumn/shared";
import { nullish } from "@/utils/genUtils.js";
import { clearOrgCache } from "../orgUtils/clearOrgCache.js";
import { disconnectStripe } from "./handleDeleteStripe.js";

export const connectStripe = async ({
  db,
  orgId,
  logger,
  apiKey,
  env,
}: {
  db: any;
  orgId: string;
  logger: any;
  apiKey: string;
  env: AppEnv;
}) => {
  // 1. Check if key is valid

  await checkKeyValid(apiKey);

  let stripe = new Stripe(apiKey);

  let account = await stripe.accounts.retrieve();

  // 2. Disconnect existing webhook endpoints
  const curWebhooks = await stripe.webhookEndpoints.list();
  for (const webhook of curWebhooks.data) {
    if (webhook.url.includes(orgId)) {
      await stripe.webhookEndpoints.del(webhook.id);
    }
  }

  // 3. Create webhook endpoint
  let webhook = await createWebhookEndpoint(apiKey, env, orgId);
  console.log("MADE IT HERE");

  // 3. Return encrypted
  if (env === AppEnv.Sandbox) {
    return {
      test_api_key: encryptData(apiKey),
      test_webhook_secret: encryptData(webhook.secret as string),
      env,
      defaultCurrency: account.default_currency,
    };
  } else {
    return {
      live_api_key: encryptData(apiKey),
      live_webhook_secret: encryptData(webhook.secret as string),
      env,
      stripeCurrency: account.default_currency,
    };
  }
};

export const connectAllStripe = async ({
  db,
  orgId,
  logger,
  testApiKey,
  liveApiKey,
  defaultCurrency,
  successUrl,
}: {
  db: any;
  orgId: string;
  logger: any;
  testApiKey: string;
  liveApiKey: string;
  defaultCurrency?: string;
  successUrl: string;
}) => {
  // 1. Check if API keys are valid
  try {
    await clearOrgCache({
      db,
      orgId,
      logger,
    });

    await checkKeyValid(testApiKey);
    await checkKeyValid(liveApiKey);

    // Get default currency from Stripe
    let stripe = new Stripe(testApiKey);

    let account = await stripe.accounts.retrieve();

    if (nullish(defaultCurrency) && nullish(account.default_currency)) {
      throw new RecaseError({
        message: "Default currency not set",
        code: ErrCode.StripeKeyInvalid,
        statusCode: 500,
      });
    } else if (nullish(defaultCurrency)) {
      defaultCurrency = account.default_currency;
    }
  } catch (error: any) {
    // console.error("Error checking stripe keys", error);
    throw new RecaseError({
      message: error.message || "Invalid Stripe API keys",
      code: ErrCode.StripeKeyInvalid,
      statusCode: 500,
      data: error,
    });
  }
  // 2. Create webhook endpoint
  let testWebhook: Stripe.WebhookEndpoint;
  let liveWebhook: Stripe.WebhookEndpoint;
  try {
    testWebhook = await createWebhookEndpoint(
      testApiKey,
      AppEnv.Sandbox,
      orgId
    );
    liveWebhook = await createWebhookEndpoint(liveApiKey, AppEnv.Live, orgId);
  } catch (error) {
    throw new RecaseError({
      message: "Error creating stripe webhook",
      code: ErrCode.StripeKeyInvalid,
      statusCode: 500,
      data: error,
    });
  }

  return {
    defaultCurrency,
    stripeConfig: {
      test_api_key: encryptData(testApiKey),
      live_api_key: encryptData(liveApiKey),
      test_webhook_secret: encryptData(testWebhook.secret as string),
      live_webhook_secret: encryptData(liveWebhook.secret as string),
      success_url: successUrl,
    },
  };
};

export const handleConnectStripe = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "connect stripe",
    handler: async (req: any, res: any) => {
      let { testApiKey, liveApiKey, successUrl, defaultCurrency } = req.body;
      let { db, orgId, logtail: logger } = req;
      if (!testApiKey || !liveApiKey || !successUrl) {
        throw new RecaseError({
          message: "Missing required fields",
          code: ErrCode.StripeKeyInvalid,
          statusCode: 400,
        });
      }

      let { defaultCurrency: finalDefaultCurrency, stripeConfig } =
        await connectAllStripe({
          db,
          orgId,
          logger,
          testApiKey,
          liveApiKey,
          defaultCurrency,
          successUrl,
        });

      // 1. Update org in Supabase
      await OrgService.update({
        db,
        orgId: req.orgId,
        updates: {
          stripe_connected: true,
          default_currency: finalDefaultCurrency,
          stripe_config: stripeConfig,
        },
      });

      res.status(200).json({
        message: "Stripe connected",
      });
    },
  });
