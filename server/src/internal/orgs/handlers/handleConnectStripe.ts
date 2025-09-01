import { routeHandler } from "@/utils/routerUtils.js";
import Stripe from "stripe";
import RecaseError from "@/utils/errorUtils.js";
import { encryptData } from "@/utils/encryptUtils.js";

import { ErrCode } from "@/errors/errCodes.js";

import {
  checkKeyValid,
  createWebhookEndpoint,
} from "@/external/stripe/stripeOnboardingUtils.js";

import { OrgService } from "../OrgService.js";
import { AppEnv } from "@autumn/shared";
import { notNullish, nullish } from "@/utils/genUtils.js";
import { clearOrgCache } from "../orgUtils/clearOrgCache.js";
import { z } from "zod";
import { isStripeConnected } from "../orgUtils.js";
import {
  ensureStripeProducts,
  ensureStripeProductsWithEnv,
} from "@/external/stripe/stripeEnsureUtils.js";
import { toSuccessUrl } from "../orgUtils/convertOrgUtils.js";

export const connectStripe = async ({
  orgId,
  apiKey,
  env,
}: {
  orgId: string;
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
    if (webhook.url.includes(orgId) && webhook.url.includes(env)) {
      await stripe.webhookEndpoints.del(webhook.id);
    }
  }

  // 3. Create new webhook endpoint
  let webhook = await createWebhookEndpoint(apiKey, env, orgId);

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
      defaultCurrency: account.default_currency,
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

const connectStripeBody = z.object({
  secret_key: z.string().optional(),
  success_url: z.string().optional(),
  default_currency: z.string().optional(),
});

export const handleConnectStripe = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "connect stripe",

    handler: async (req: any, res: any) => {
      // 1. Get body
      const { secret_key, success_url, default_currency } =
        connectStripeBody.parse(req.body);

      if (!secret_key && !success_url && !default_currency) {
        throw new RecaseError({
          message: "Missing required fields",
          code: ErrCode.InvalidRequest,
          statusCode: 400,
        });
      }

      // 2. If secret_key present, but stripe not disconnected, throw an error
      if (secret_key && isStripeConnected({ org: req.org, env: req.env })) {
        throw new RecaseError({
          message:
            "Please disconnect Stripe before connecting a new secret key",
          code: ErrCode.InvalidRequest,
          statusCode: 400,
        });
      }

      if (success_url) {
        if (!success_url.startsWith("https://")) {
          throw new RecaseError({
            message: "Success URL should start with https://",
            code: ErrCode.InvalidRequest,
            statusCode: 400,
          });
        }
      }

      const { logger } = req;

      logger.info(`Connecting stripe for org ${req.org.slug}, ENV: ${req.env}`);

      if (!isStripeConnected({ org: req.org, env: req.env }) && !secret_key) {
        throw new RecaseError({
          message: "Please provide your stripe secret key",
          code: ErrCode.InvalidRequest,
          statusCode: 400,
        });
      }

      const curOrg = structuredClone(req.org);
      const isSandbox = req.env === AppEnv.Sandbox;
      const curDefaultCurrency = curOrg.default_currency;

      // 1. Reconnect stripe
      let updates: any = {};
      if (secret_key) {
        const result = await connectStripe({
          orgId: req.orgId,
          apiKey: secret_key!,
          env: req.env,
        });

        logger.info(`Created new stripe connection`);

        updates = {
          stripe_config: {
            ...curOrg.stripe_config,
          },
          default_currency: nullish(curDefaultCurrency)
            ? result.defaultCurrency
            : undefined,
        };

        if (isSandbox) {
          updates.stripe_config.test_api_key = result.test_api_key;
          updates.stripe_config.test_webhook_secret =
            result.test_webhook_secret;
        } else {
          updates.stripe_config.live_api_key = result.live_api_key;
          updates.stripe_config.live_webhook_secret =
            result.live_webhook_secret;
        }
      }

      // 2. If success url present, add it to the updates
      console.log(
        "Cur success URL:",
        toSuccessUrl({ org: curOrg, env: req.env })
      );

      console.log("New success URL:", success_url);
      if (success_url !== undefined) {
        updates = {
          ...updates,
          stripe_config: {
            ...curOrg.stripe_config,
            ...(updates?.stripe_config || {}),
          },
        };

        if (isSandbox) {
          updates.stripe_config.sandbox_success_url = success_url;
        } else {
          updates.stripe_config.success_url = success_url;
        }
      }

      // 3. Default currency
      if (default_currency) {
        updates = {
          ...updates,
          default_currency: default_currency,
        };
      }

      const newOrg = await OrgService.update({
        db: req.db,
        orgId: req.orgId,
        updates: updates,
      });

      // Initialize stripe prices...
      await ensureStripeProductsWithEnv({
        db: req.db,
        logger: req.logger,
        req,
        org: newOrg!,
        env: req.env,
      });

      res.status(200).json({
        message: "Stripe connected",
      });
    },
  });
